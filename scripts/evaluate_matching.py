"""Evaluate semantic mentor matching (Issue #6) against frozen relevance labels.

  1. Build labels once (or after the dataset changes):
       .venv/Scripts/python.exe scripts/evaluate_matching.py --build-labels
  2. Start the matching service, then evaluate:
       .venv/Scripts/python.exe scripts/evaluate_matching.py

Relevance is defined by explicit, documented rules over each eligible mentor's
former department and skills (see evaluation/relevance_labels.json). Results are
computed through the real POST /mentors/search endpoint and compared with a
TF-IDF keyword baseline over the same profile text. Synthetic data only: these
numbers describe behaviour on fictional profiles, not real Kenya Airways alumni.
"""
import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_database import ROOT, local_dsn  # noqa: E402
from services.matching.app.indexing import source_text  # noqa: E402

K = 5
LABELS = ROOT / "evaluation/relevance_labels.json"
RESULTS = ROOT / "evaluation/results"

# (id, query, rule). A profile is relevant if its former department is listed OR it has any listed skill.
QUERIES = [
    ("cloud", "I want to move from IT support into AWS cloud engineering and DevOps.",
     {"departments": ["ICT / Digital"], "skills": ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux"]}),
    ("pilot", "How do I progress from first officer to captain as an airline pilot?",
     {"departments": ["Flight Operations"], "skills": ["Flight Planning", "Navigation", "Flight Training"]}),
    ("finance", "I need guidance on a finance career: budgeting, forecasting and financial reporting.",
     {"departments": ["Finance"], "skills": ["Financial Analysis", "Budgeting", "Financial Reporting", "Forecasting", "IFRS", "Audit"]}),
    ("cabin-hospitality", "How can I use my cabin crew experience to move into hospitality and guest experience?",
     {"departments": ["Cabin Services"], "skills": ["Service Recovery"]}),
    ("cargo", "I want a career in cargo, freight logistics and supply chain management.",
     {"departments": ["Cargo"], "skills": ["Cargo Handling", "Supply Chain", "Freight Forwarding", "Warehouse Management", "Customs Compliance"]}),
    ("maintenance", "Advice on aircraft maintenance engineering, inspections and maintenance planning.",
     {"departments": ["Engineering & Maintenance"], "skills": ["Aircraft Maintenance", "Maintenance Planning", "Technical Inspection", "Reliability Engineering"]}),
    ("hr", "Help me grow in human resources: recruitment, talent and people management.",
     {"departments": ["Human Resources"], "skills": ["Recruitment", "Talent Management", "Employee Relations"]}),
    ("safety", "I am interested in aviation safety management, risk assessment and compliance audits.",
     {"departments": ["Safety & Quality"], "skills": ["Risk Assessment", "Safety Management", "Incident Investigation", "Auditing"]}),
    ("ground", "How do I lead airport ground handling and ramp operations teams?",
     {"departments": ["Ground Operations"], "skills": ["Ground Handling", "Turnaround Planning"]}),
    ("commercial", "I want to work in sales, marketing and airline revenue management.",
     {"departments": ["Commercial"], "skills": ["Sales", "Marketing", "Revenue Management", "Pricing Strategy", "Digital Marketing"]}),
    ("procurement", "Guidance on procurement, contract management and supplier negotiation.",
     {"departments": ["Corporate Services"], "skills": ["Procurement", "Contract Management", "Negotiation", "Vendor Management"]}),
    ("service-quality", "How can I improve customer service quality and complaint handling?",
     {"departments": ["Customer Experience"], "skills": ["Service Quality", "Complaint Handling", "Service Design"]}),
]
# Career-transition queries: relevance comes from where the mentor works now, so the
# answer usually is not stated in the query's vocabulary. Harder for keyword matching.
TRANSITION_QUERIES = [
    ("t-instructor", "I'm a pilot who wants to teach new pilots for a living.",
     {"title_contains": ["Instructor"], "skills": ["Flight Training"]}),
    ("t-banking", "I want to leave aviation and work in a bank.",
     {"industries": ["Finance"]}),
    ("t-hospitality", "How do I move from airline work into hotels and resorts?",
     {"industries": ["Hospitality"]}),
    ("t-security", "I'm interested in protecting systems from hackers at a fintech company.",
     {"skills": ["Cybersecurity"], "title_contains": ["Cybersecurity"]}),
    ("t-coaching", "I would like to train and coach people as my main job.",
     {"title_contains": ["Trainer", "Instructor", "Coach"], "skills": ["Training", "Training Delivery", "Coaching"]}),
    ("t-consulting", "Can I become an independent consultant after my airline career?",
     {"organizations": ["Independent Consultant"], "industries": ["Consulting"]}),
    ("t-telecom", "I want to join a mobile network operator.",
     {"industries": ["Telecommunications"]}),
    ("t-data", "I want to build data pipelines and work on analytics.",
     {"skills": ["Data Engineering", "SQL", "Customer Analytics"], "title_contains": ["Data"]}),
    ("t-manufacturing", "What is it like to run quality and maintenance in a factory?",
     {"industries": ["Manufacturing"]}),
    ("t-energy", "Careers in the energy sector, for example geothermal power.",
     {"industries": ["Energy"]}),
]
QUERY_SETS = {"domain": QUERIES, "transition": TRANSITION_QUERIES}

NEGATIVE_CONTROL = ("control", "Astrophysics research on black holes and galaxy formation.")


def eligible_profiles(conn):
    """Exactly the search corpus: consenting, available mentors with an embedding."""
    rows = conn.execute("""
        SELECT p.id::text AS profile_id, split_part(u.email, '@', 1) AS synthetic_id, p.headline, p.biography,
            p.former_kq_department, p.industry, p.current_job_title, p.current_organization,
            COALESCE((SELECT array_agg(s.name) FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id WHERE ps.profile_id = p.id), '{}') AS skills,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('organization', w.organization, 'job_title', w.job_title, 'description', w.description))
                FROM work_experience w WHERE w.profile_id = p.id), '[]'::jsonb) AS experience,
            m.mentorship_topics
        FROM profiles p JOIN users u ON u.id = p.user_id
        JOIN mentorship_preferences m ON m.profile_id = p.id
        JOIN profile_embeddings e ON e.profile_id = p.id
        WHERE m.consent_to_matching AND m.available_for_mentorship AND u.email LIKE '%%@synthetic.lumina.local'
        ORDER BY u.email
    """).fetchall()
    return rows


def relevant(profile, rule):
    return (profile["former_kq_department"] in rule.get("departments", [])
            or bool(set(profile["skills"]) & set(rule.get("skills", [])))
            or profile["industry"] in rule.get("industries", [])
            or profile["current_organization"] in rule.get("organizations", [])
            or any(word in (profile["current_job_title"] or "") for word in rule.get("title_contains", [])))


def build_labels():
    with psycopg.connect(local_dsn(), row_factory=dict_row) as conn:
        profiles = eligible_profiles(conn)
    labels = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "k": K,
              "corpus_size": len(profiles),
              "rule": "Relevant if any listed criterion matches: former KQ department, skill, current industry, current organization, or a word in the current job title.",
              "queries": [{"id": qid, "set": name, "query": query, "criteria": rule,
                           "relevant": sorted(p["synthetic_id"] for p in profiles if relevant(p, rule))}
                          for name, queries in QUERY_SETS.items() for qid, query, rule in queries]}
    LABELS.parent.mkdir(exist_ok=True)
    LABELS.write_text(json.dumps(labels, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(labels['queries'])} labelled queries over {len(profiles)} eligible mentors to {LABELS.relative_to(ROOT)}")


def semantic_search(base, query):
    request = urllib.request.Request(f"{base}/mentors/search", method="POST", headers={"Content-Type": "application/json"},
                                     data=json.dumps({"query": query, "top_k": K}).encode())
    with urllib.request.urlopen(request, timeout=120) as response:
        return [item["profile_id"] for item in json.load(response)["results"]]


def keyword_ranker(profiles):
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import linear_kernel
    texts = [source_text({**p, "experience": p["experience"]}) for p in profiles]
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
    matrix = vectorizer.fit_transform(texts)

    def rank(query):
        scores = linear_kernel(vectorizer.transform([query]), matrix).ravel()
        order = sorted(range(len(profiles)), key=lambda i: (-scores[i], profiles[i]["profile_id"]))
        return [profiles[i]["profile_id"] for i in order[:K] if scores[i] > 0]
    return rank


def metrics(ranked, relevant_ids):
    hits = [pid in relevant_ids for pid in ranked[:K]]
    tp = sum(hits)
    precision = tp / K
    recall = tp / len(relevant_ids) if relevant_ids else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    rr = next((1 / (i + 1) for i, hit in enumerate(hits) if hit), 0.0)
    return {"hits": tp, "returned": len(ranked), "precision_at_5": precision, "recall_at_5": recall, "f1_at_5": f1,
            "reciprocal_rank": rr, "recall_ceiling": min(K, len(relevant_ids)) / len(relevant_ids) if relevant_ids else 0.0}


def mean(rows, key):
    return round(sum(row[key] for row in rows) / len(rows), 4)


def evaluate():
    labels = json.loads(LABELS.read_text(encoding="utf-8"))
    base = os.getenv("MATCHING_SERVICE_URL", "http://127.0.0.1:8000").rstrip("/")
    with psycopg.connect(local_dsn(), row_factory=dict_row) as conn:
        profiles = eligible_profiles(conn)
    by_synthetic = {p["synthetic_id"]: p for p in profiles}
    by_profile = {p["profile_id"]: p for p in profiles}
    if len(profiles) != labels["corpus_size"]:
        raise SystemExit(f"Corpus changed ({len(profiles)} vs {labels['corpus_size']} when labelled); rebuild labels")
    keyword = keyword_ranker(profiles)
    report = {"evaluated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "k": K,
              "corpus_size": len(profiles), "model": "BAAI/bge-base-en-v1.5", "queries": []}
    for item in labels["queries"]:
        relevant_ids = {by_synthetic[s]["profile_id"] for s in item["relevant"] if s in by_synthetic}
        semantic = semantic_search(base, item["query"])
        baseline = keyword(item["query"])
        describe = lambda ids: [{"synthetic_id": by_profile[i]["synthetic_id"], "department": by_profile[i]["former_kq_department"],
                                 "relevant": i in relevant_ids} for i in ids if i in by_profile]
        report["queries"].append({"id": item["id"], "set": item["set"], "query": item["query"], "relevant_count": len(relevant_ids),
                                  "semantic": {**metrics(semantic, relevant_ids), "top": describe(semantic)},
                                  "keyword_baseline": {**metrics(baseline, relevant_ids), "top": describe(baseline)}})
    control = semantic_search(base, NEGATIVE_CONTROL[1])
    report["negative_control"] = {"query": NEGATIVE_CONTROL[1], "semantic_results": len(control),
                                  "keyword_results": len(keyword(NEGATIVE_CONTROL[1]))}
    keys = ("precision_at_5", "recall_at_5", "f1_at_5", "reciprocal_rank", "recall_ceiling")
    report["macro"] = {scope: {system: {key: mean([q[system] for q in report["queries"] if scope == "all" or q["set"] == scope], key) for key in keys}
                               for system in ("semantic", "keyword_baseline")} for scope in ("domain", "transition", "all")}
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "matching_evaluation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (RESULTS / "matching_evaluation.md").write_text(markdown(report), encoding="utf-8")
    for scope in ("domain", "transition", "all"):
        s, b = report["macro"][scope]["semantic"], report["macro"][scope]["keyword_baseline"]
        print(f"[{scope}] Semantic P@5 {s['precision_at_5']:.3f} R@5 {s['recall_at_5']:.3f} F1@5 {s['f1_at_5']:.3f} MRR {s['reciprocal_rank']:.3f} | "
              f"Keyword P@5 {b['precision_at_5']:.3f} R@5 {b['recall_at_5']:.3f} F1@5 {b['f1_at_5']:.3f} MRR {b['reciprocal_rank']:.3f}")
    print(f"Negative control returned {report['negative_control']['semantic_results']} semantic results")
    print(f"Saved {(RESULTS / 'matching_evaluation.md').relative_to(ROOT)}")


def markdown(report):
    lines = [
        "# Semantic mentor matching evaluation", "",
        f"Evaluated {report['evaluated_at']} · model `{report['model']}` · k = {report['k']} · "
        f"{report['corpus_size']} eligible synthetic mentors (consenting, available, embedded).", "",
        "Relevance labels are rule-based and frozen in `evaluation/relevance_labels.json`. "
        "**Domain** queries name a former-department area (relevant: matching department or listed skill). "
        "**Transition** queries describe a career move; relevance comes from the mentor's current industry, "
        "organization, job title or skills, which the query usually does not name. "
        "All profiles are fictional, so these figures do not describe performance on real Kenya Airways alumni.", "",
        "## Macro averages", "",
        "| Query set | System | P@5 | R@5 | F1@5 | MRR | R@5 ceiling |", "| --- | --- | --- | --- | --- | --- | --- |",
        *[f"| {scope.title()} | {label} | {m['precision_at_5']:.3f} | {m['recall_at_5']:.3f} | {m['f1_at_5']:.3f} | {m['reciprocal_rank']:.3f} | {m['recall_ceiling']:.3f} |"
          for scope in ("domain", "transition", "all")
          for label, m in (("Semantic (BGE + pgvector)", report["macro"][scope]["semantic"]), ("Keyword baseline (TF-IDF)", report["macro"][scope]["keyword_baseline"]))], "",
        "R@5 cannot exceed the ceiling shown: with more than five relevant mentors, five results can only recover a fraction of them.", "",
        "## Per query", "",
        "| Set | Query | Relevant | Semantic P@5 | Semantic R@5 | Keyword P@5 | Keyword R@5 |", "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for q in report["queries"]:
        lines.append(f"| {q['set']} | {q['query']} | {q['relevant_count']} | {q['semantic']['precision_at_5']:.2f} | {q['semantic']['recall_at_5']:.2f} | "
                     f"{q['keyword_baseline']['precision_at_5']:.2f} | {q['keyword_baseline']['recall_at_5']:.2f} |")
    misses = [q for q in report["queries"] if q["semantic"]["precision_at_5"] < 0.8]
    lines += ["", "## Failure cases (semantic P@5 below 0.8)", ""]
    if not misses:
        lines.append("None.")
    for q in misses:
        wrong = ", ".join(f"{t['synthetic_id']} ({t['department']})" for t in q["semantic"]["top"] if not t["relevant"]) or "fewer than five results above the similarity threshold"
        lines.append(f"- **{q['query']}** returned {q['semantic']['returned']} result(s); not relevant: {wrong}.")
    control = report["negative_control"]
    lines += ["", "## Negative control", "",
              f"Off-topic query “{control['query']}” returned {control['semantic_results']} semantic result(s) "
              f"(similarity threshold applied) and {control['keyword_results']} keyword result(s).", "",
              "## Limitations", "",
              "- Labels are derived from structured fields, not independent human judgement.",
              "- Synthetic biographies follow templates, which can make semantic and keyword signals easier than real profiles.",
              "- Results depend on the configured similarity threshold and current mentor availability.", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--build-labels", action="store_true")
    if parser.parse_args().build_labels:
        build_labels()
    else:
        evaluate()
