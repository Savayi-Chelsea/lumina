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

Outputs (evaluation/results/):
  matching_evaluation.json / .md   full report (unchanged format, extended)
  matching/queries.csv             the 22 labelled queries and their relevant mentor IDs
  matching/corpus.csv              all 200 profiles with eligibility (consent, availability, embedding)
  matching/per_query_metrics.csv   P@5, R@5, F1@5, RR@5 per query and system
  matching/per_query_rankings.csv  every ranked result per query and system, with relevance
  matching/comparison.csv          macro averages with bootstrap 95% confidence intervals
  matching/significance.csv        paired Wilcoxon signed-rank tests between systems
  matching/threshold_sweep.csv     semantic retrieval at alternative similarity thresholds
                                   (analysis only; the production threshold is not changed)
"""
import argparse
import csv
import json
import math
import random
import statistics
import time
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
from services.matching.app.hybrid import BM25, fuse  # noqa: E402

K = 5
LABELS = ROOT / "evaluation/relevance_labels.json"
RESULTS = ROOT / "evaluation/results"
DETAIL = RESULTS / "matching"
SYSTEMS = (("semantic", "Semantic (BGE + pgvector)"), ("keyword_baseline", "Keyword (TF-IDF)"), ("hybrid", "Hybrid (BGE + BM25, RRF)"))
THRESHOLDS = (0.40, 0.45, 0.50, 0.55, 0.60, 0.65)
BOOTSTRAP_SAMPLES, SEED = 10000, 20261117
LATENCY_ROUNDS = 0  # extra timed rounds of production searches (--latency-rounds)

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

# Expanded query set (45 queries) for the 200- vs 500-profile comparison. Rules were
# written before any expanded evaluation was run and are applied unchanged to both corpora.
SKILL_QUERIES = [
    ("s-kubernetes", "I need a mentor who has run Kubernetes and Terraform in production.",
     {"skills": ["Kubernetes", "Terraform"]}),
    ("s-ifrs", "Who can help me master IFRS financial reporting?",
     {"skills": ["IFRS", "Financial Reporting"]}),
    ("s-sql-bi", "I want to get better at SQL and building Power BI dashboards.",
     {"skills": ["SQL", "Power BI"]}),
    ("s-iso", "Looking for guidance on ISO 9001 quality management audits.",
     {"skills": ["ISO 9001", "Quality Management"]}),
    ("s-revenue", "I want to learn revenue management and pricing strategy.",
     {"skills": ["Revenue Management", "Pricing Strategy"]}),
    ("s-customs", "Help with customs clearance, dangerous goods and freight forwarding.",
     {"skills": ["Customs Compliance", "Dangerous Goods", "Freight Forwarding"]}),
]
EXTRA_TRANSITION_QUERIES = [
    ("t-developer", "I'm a flight attendant who wants to become a software developer.",
     {"title_contains": ["Software"], "skills": ["Software Development"]}),
    ("t-renewables", "I want to move from aircraft engineering into renewable energy.",
     {"industries": ["Energy"], "skills": ["Solar PV", "Renewable Energy"]}),
    ("t-product", "How do I become a product manager at a fintech or tech company?",
     {"title_contains": ["Product"], "skills": ["Product Management"]}),
    ("t-ngo", "I'd like to work for an NGO on development programmes.",
     {"industries": ["Non-profit"], "skills": ["Program Management", "Monitoring and Evaluation"]}),
    ("t-healthcare", "Can airline operations experience transfer to running a hospital?",
     {"industries": ["Healthcare"]}),
]
LEADERSHIP_QUERIES = [
    ("l-first-manager", "I've just been promoted and will manage a team for the first time.",
     {"skills": ["Team Leadership", "People Management", "Team Supervision"]}),
    ("l-executive", "How do I prepare for a director or executive role?",
     {"title_contains": ["Director", "Chief", "Head of", "General Manager", "General Counsel"]}),
    ("l-change", "I need advice on leading organisational change and transformation.",
     {"skills": ["Change Management", "Organisational Development"]}),
    ("l-strategy", "Help me think strategically and present plans to senior stakeholders.",
     {"skills": ["Strategic Planning", "Stakeholder Management"]}),
    ("l-operations", "How do I lead large shift-based operations teams at an airport?",
     {"title_contains": ["Station Manager", "Airport Operations", "Cargo Operations Manager", "Flight Operations Manager"],
      "skills": ["Team Supervision", "Turnaround Planning"]}),
]
INDUSTRY_QUERIES = [
    ("i-tourism", "I want to move into tourism and safari travel.", {"industries": ["Tourism"]}),
    ("i-government", "What are careers like in government and public policy?", {"industries": ["Government"]}),
    ("i-agriculture", "I'd like to work in agriculture or agribusiness exports.", {"industries": ["Agriculture"]}),
    ("i-real-estate", "Is real estate a good next step after the airline?", {"industries": ["Real Estate"]}),
]
BROAD_QUERIES = [
    ("b-next-step", "I left the airline recently and I'm not sure what to do next.",
     {"topics": ["Career change after aviation"]}),
    ("b-business", "I want to start my own business.",
     {"title_contains": ["Founder"], "topics": ["Starting a business"]}),
    ("b-cv", "Help me rewrite my CV and prepare for interviews outside aviation.",
     {"topics": ["CV and interview preparation"], "skills": ["Recruitment"]}),
]
EXPANDED_QUERY_SETS = {"domain": QUERIES, "skill": SKILL_QUERIES, "transition": TRANSITION_QUERIES + EXTRA_TRANSITION_QUERIES,
                       "leadership": LEADERSHIP_QUERIES, "industry": INDUSTRY_QUERIES, "broad": BROAD_QUERIES}
SET_DESCRIPTIONS = {
    "domain": "name a former-department area (relevant: matching department or listed skill)",
    "skill": "ask for specific skills (relevant: mentor lists one of them)",
    "transition": "describe a career move (relevant: where the mentor works now: industry, organization, title or skills)",
    "leadership": "ask for leadership help (relevant: leadership skills or a senior title)",
    "industry": "name a destination industry (relevant: mentor's current industry)",
    "broad": "state a broad career need (relevant: a mentorship topic, title or skill that addresses it)",
}

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
            or any(word in (profile["current_job_title"] or "") for word in rule.get("title_contains", []))
            or any(topic.lower() in (profile["mentorship_topics"] or "").lower() for topic in rule.get("topics", [])))


def build_labels(query_sets=None):
    query_sets = query_sets or QUERY_SETS
    with psycopg.connect(local_dsn(), row_factory=dict_row) as conn:
        profiles = eligible_profiles(conn)
    labels = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "k": K,
              "corpus_size": len(profiles),
              "rule": "Relevant if any listed criterion matches: former KQ department, skill, current industry, current organization, "
                      "a word in the current job title, or (expanded set only) a mentorship topic.",
              "queries": [{"id": qid, "set": name, "query": query, "criteria": rule,
                           "relevant": sorted(p["synthetic_id"] for p in profiles if relevant(p, rule))}
                          for name, queries in query_sets.items() for qid, query, rule in queries]}
    LABELS.parent.mkdir(exist_ok=True)
    LABELS.write_text(json.dumps(labels, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(labels['queries'])} labelled queries over {len(profiles)} eligible mentors to {LABELS.relative_to(ROOT)}")


# Mentors the live service may return that are outside the synthetic evaluation corpus
# (for example a real member who opted in). Cosine ranking scores each mentor
# independently, so asking for K + len(OUTSIDE) results and dropping outsiders gives
# exactly the ranking the service would produce over the evaluation corpus alone.
OUTSIDE = set()
CORPUS_IDS = set()


def service_search(base, query, top_k=K, threshold=None):
    body = {"query": query, "top_k": min(50, top_k + len(OUTSIDE))}
    if threshold is not None:
        body["similarity_threshold"] = threshold
    request = urllib.request.Request(f"{base}/mentors/search", method="POST", headers={"Content-Type": "application/json"},
                                     data=json.dumps(body).encode())
    with urllib.request.urlopen(request, timeout=120) as response:
        data = json.load(response)
    results = [item for item in data["results"] if item["profile_id"] not in OUTSIDE]
    if CORPUS_IDS and any(item["profile_id"] not in CORPUS_IDS for item in results):
        raise SystemExit("The service returned a mentor outside the evaluation corpus; rerun after the corpus settles")
    return results[:top_k], data["similarity_threshold"]


def timed(call, *args):
    start = time.perf_counter()
    value = call(*args)
    return value, (time.perf_counter() - start) * 1000


def latency_stats(values):
    ordered = sorted(values)
    p95 = ordered[max(0, math.ceil(0.95 * len(ordered)) - 1)]  # nearest-rank percentile
    return {"n": len(ordered), "mean_ms": round(sum(ordered) / len(ordered), 1), "median_ms": round(statistics.median(ordered), 1),
            "p95_ms": round(p95, 1), "max_ms": round(ordered[-1], 1)}


def semantic_search(base, query, top_k=K):
    return [item["profile_id"] for item in service_search(base, query, top_k)[0]]


def hybrid_ranker(base, profiles):
    """Semantic candidates (threshold applied) re-ranked with BM25 by reciprocal rank fusion."""
    bm25 = BM25({p["profile_id"]: source_text({**p, "experience": p["experience"]}) for p in profiles})
    return lambda query: fuse(semantic_search(base, query, 50), bm25.scores(query), K)


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
        OUTSIDE.update(r["profile_id"] for r in conn.execute("""
            SELECT p.id::text AS profile_id FROM profile_embeddings e JOIN profiles p ON p.id = e.profile_id
            JOIN users u ON u.id = p.user_id JOIN mentorship_preferences m ON m.profile_id = p.id
            WHERE m.consent_to_matching AND m.available_for_mentorship AND e.model_name = 'BAAI/bge-base-en-v1.5'
              AND u.email NOT LIKE '%%@synthetic.lumina.local'""").fetchall())
        corpus_rows = corpus_table(conn)
    CORPUS_IDS.update(p["profile_id"] for p in profiles)
    by_synthetic = {p["synthetic_id"]: p for p in profiles}
    by_profile = {p["profile_id"]: p for p in profiles}
    if len(profiles) != labels["corpus_size"]:
        raise SystemExit(f"Corpus changed ({len(profiles)} vs {labels['corpus_size']} when labelled); rebuild labels")
    keyword = keyword_ranker(profiles)
    hybrid = hybrid_ranker(base, profiles)
    threshold = service_search(base, "aviation careers")[1]
    report = {"evaluated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "k": K,
              "corpus_size": len(profiles), "model": "BAAI/bge-base-en-v1.5", "similarity_threshold": threshold,
              "non_synthetic_mentors_excluded": len(OUTSIDE), "labels": str(LABELS.relative_to(ROOT)), "queries": [],
              "unanswerable": [{"id": q["id"], "set": q["set"], "query": q["query"]} for q in labels["queries"] if not q["relevant"]]}
    rankings, timings = [], []
    answerable = [item for item in labels["queries"] if item["relevant"]]  # no relevant mentor in this corpus: nothing to retrieve
    for item in answerable:
        relevant_ids = {by_synthetic[s]["profile_id"] for s in item["relevant"] if s in by_synthetic}
        (scored, _), semantic_ms = timed(service_search, base, item["query"])
        semantic = [r["profile_id"] for r in scored]
        scores = {r["profile_id"]: r["similarity_score"] for r in scored}
        baseline, keyword_ms = timed(keyword, item["query"])
        fused, hybrid_ms = timed(hybrid, item["query"])
        timings += [{"query_id": item["id"], "system": system, "round": 0, "ms": round(ms, 2)}
                    for system, ms in (("semantic", semantic_ms), ("keyword_baseline", keyword_ms), ("hybrid", hybrid_ms))]
        for system, ranked in (("semantic", semantic), ("keyword_baseline", baseline), ("hybrid", fused)):
            for rank, pid in enumerate(ranked, start=1):
                p = by_profile[pid]
                rankings.append({"query_id": item["id"], "set": item["set"], "system": system, "rank": rank,
                                 "synthetic_id": p["synthetic_id"], "former_kq_department": p["former_kq_department"],
                                 "current_job_title": p["current_job_title"], "industry": p["industry"],
                                 "semantic_similarity": round(scores[pid], 6) if system == "semantic" else "",
                                 "relevant": pid in relevant_ids})
        describe = lambda ids: [{"synthetic_id": by_profile[i]["synthetic_id"], "department": by_profile[i]["former_kq_department"],
                                 "relevant": i in relevant_ids} for i in ids if i in by_profile]
        report["queries"].append({"id": item["id"], "set": item["set"], "query": item["query"], "relevant_count": len(relevant_ids),
                                  "semantic": {**metrics(semantic, relevant_ids), "top": describe(semantic)},
                                  "keyword_baseline": {**metrics(baseline, relevant_ids), "top": describe(baseline)},
                                  "hybrid": {**metrics(fused, relevant_ids), "top": describe(fused)}})
    control = semantic_search(base, NEGATIVE_CONTROL[1])
    report["negative_control"] = {"query": NEGATIVE_CONTROL[1], "semantic_results": len(control),
                                  "keyword_results": len(keyword(NEGATIVE_CONTROL[1])), "hybrid_results": len(hybrid(NEGATIVE_CONTROL[1]))}
    # Repeated production-path searches over every labelled query (answerable or not), so latency is
    # always measured on the same query set whatever the corpus.
    for round_number in range(1, LATENCY_ROUNDS + 1):
        for item in labels["queries"]:
            timings.append({"query_id": item["id"], "system": "semantic_repeated", "round": round_number,
                            "ms": round(timed(service_search, base, item["query"])[1], 2)})
    report["latency"] = {system: latency_stats([t["ms"] for t in timings if t["system"] == system])
                         for system in ("semantic", "keyword_baseline", "hybrid", "semantic_repeated") if any(t["system"] == system for t in timings)}
    report["latency_rounds"] = LATENCY_ROUNDS
    keys = ("precision_at_5", "recall_at_5", "f1_at_5", "reciprocal_rank", "recall_ceiling")
    report["macro"] = {scope: {system: {key: mean([q[system] for q in report["queries"] if scope == "all" or q["set"] == scope], key) for key in keys}
                               for system in ("semantic", "keyword_baseline", "hybrid")} for scope in scopes(report["queries"])}
    report["confidence_intervals"] = bootstrap(report["queries"])
    report["significance"] = significance(report["queries"])
    report["threshold_sweep"] = threshold_sweep(base, {**labels, "queries": answerable}, by_synthetic)
    RESULTS.mkdir(parents=True, exist_ok=True)
    write_detail(report, labels, rankings, corpus_rows)
    write_csv(DETAIL / "latency_samples.csv", timings, ["query_id", "system", "round", "ms"])
    write_csv(DETAIL / "latency_summary.csv", [{"system": system, **stats} for system, stats in report["latency"].items()],
              ["system", "n", "mean_ms", "median_ms", "p95_ms", "max_ms"])
    (RESULTS / "matching_evaluation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (RESULTS / "matching_evaluation.md").write_text(markdown(report), encoding="utf-8")
    for scope in scopes(report["queries"]):
        for label, system in (("Semantic", "semantic"), ("Keyword", "keyword_baseline"), ("Hybrid", "hybrid")):
            m = report["macro"][scope][system]
            print(f"[{scope}] {label:8} P@5 {m['precision_at_5']:.3f} R@5 {m['recall_at_5']:.3f} F1@5 {m['f1_at_5']:.3f} MRR {m['reciprocal_rank']:.3f}")
    print(f"Negative control returned {report['negative_control']['semantic_results']} semantic results")
    if report["unanswerable"]:
        print(f"Skipped {len(report['unanswerable'])} queries with no relevant mentor in this corpus: {', '.join(q['id'] for q in report['unanswerable'])}")
    print("Latency (ms): " + "; ".join(f"{s} median {v['median_ms']} p95 {v['p95_ms']}" for s, v in report["latency"].items()))
    print(f"Saved {(RESULTS / 'matching_evaluation.md').relative_to(ROOT)}")


def corpus_table(conn):
    """Every synthetic profile with the three eligibility conditions the search applies."""
    return conn.execute("""
        SELECT split_part(u.email, '@', 1) AS synthetic_id, p.former_kq_department, p.industry, p.current_job_title,
            COALESCE(m.consent_to_matching, FALSE) AS consent_to_matching,
            COALESCE(m.available_for_mentorship, FALSE) AS available_for_mentorship,
            (e.profile_id IS NOT NULL) AS embedded,
            (COALESCE(m.consent_to_matching, FALSE) AND COALESCE(m.available_for_mentorship, FALSE) AND e.profile_id IS NOT NULL) AS eligible
        FROM profiles p JOIN users u ON u.id = p.user_id
        LEFT JOIN mentorship_preferences m ON m.profile_id = p.id
        LEFT JOIN profile_embeddings e ON e.profile_id = p.id
        WHERE u.email LIKE '%%@synthetic.lumina.local' ORDER BY u.email""").fetchall()


METRICS = ("precision_at_5", "recall_at_5", "f1_at_5", "reciprocal_rank")


def scopes(queries):
    """Query sets in order of first appearance, then all queries (domain, transition, all for the original set)."""
    return list(dict.fromkeys(q["set"] for q in queries)) + ["all"]


def bootstrap(queries):
    """Percentile 95% confidence intervals for macro means, resampling queries with replacement."""
    rng = random.Random(SEED)
    out = {}
    for scope in scopes(queries):
        rows = [q for q in queries if scope == "all" or q["set"] == scope]
        samples = [[rng.randrange(len(rows)) for _ in rows] for _ in range(BOOTSTRAP_SAMPLES)]
        out[scope] = {}
        for system, _ in SYSTEMS:
            out[scope][system] = {}
            for metric in METRICS:
                values = [q[system][metric] for q in rows]
                means = sorted(sum(values[i] for i in sample) / len(sample) for sample in samples)
                out[scope][system][metric] = [round(means[int(0.025 * len(means))], 4), round(means[int(0.975 * len(means)) - 1], 4)]
    return out


def significance(queries):
    """Two-sided Wilcoxon signed-rank tests on per-query scores (paired by query)."""
    from scipy.stats import wilcoxon
    tests = []
    counts = {name: sum(1 for q in queries if q["set"] == name) for name in scopes(queries)[:-1]}
    tested = [name for name, n in counts.items() if n >= 5 and name != "domain"] + ["all"]  # original set: transition, all
    for scope in tested:
        rows = [q for q in queries if scope == "all" or q["set"] == scope]
        for a, b in (("semantic", "keyword_baseline"), ("semantic", "hybrid"), ("hybrid", "keyword_baseline")):
            for metric in ("f1_at_5", "reciprocal_rank"):
                x, y = [q[a][metric] for q in rows], [q[b][metric] for q in rows]
                differences = [i - j for i, j in zip(x, y) if abs(i - j) > 1e-12]
                entry = {"scope": scope, "a": a, "b": b, "metric": metric, "n_queries": len(rows),
                         "n_nonzero_differences": len(differences),
                         "a_better": sum(1 for d in differences if d > 0), "b_better": sum(1 for d in differences if d < 0),
                         "mean_difference": round(sum(x) / len(x) - sum(y) / len(y), 4)}
                if len(differences) >= 1:
                    result = wilcoxon(x, y, zero_method="wilcox", alternative="two-sided")
                    entry.update(statistic=float(result.statistic), p_value=round(float(result.pvalue), 4))
                else:
                    entry.update(statistic=None, p_value=None)
                tests.append(entry)
    return tests


def threshold_sweep(base, labels, by_synthetic):
    """Semantic retrieval at alternative thresholds. Analysis only: production stays at the configured value."""
    rows = []
    for threshold in THRESHOLDS:
        per_query = []
        for item in labels["queries"]:
            relevant_ids = {by_synthetic[s]["profile_id"] for s in item["relevant"] if s in by_synthetic}
            ranked = [r["profile_id"] for r in service_search(base, item["query"], K, threshold)[0]]
            per_query.append(metrics(ranked, relevant_ids))
        control = len(service_search(base, NEGATIVE_CONTROL[1], K, threshold)[0])
        rows.append({"threshold": threshold,
                     **{key: mean(per_query, key) for key in METRICS},
                     "mean_results_returned": mean(per_query, "returned"),
                     "queries_with_fewer_than_5": sum(1 for q in per_query if q["returned"] < K),
                     "queries_with_no_results": sum(1 for q in per_query if q["returned"] == 0),
                     "negative_control_results": control})
    return rows


def write_csv(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows({key: row.get(key, "") for key in fields} for row in rows)


def write_detail(report, labels, rankings, corpus_rows):
    DETAIL.mkdir(parents=True, exist_ok=True)
    write_csv(DETAIL / "queries.csv", [{"query_id": q["id"], "set": q["set"], "query": q["query"],
              "relevance_criteria": json.dumps(q["criteria"], sort_keys=True), "relevant_count": len(q["relevant"]),
              "relevant_mentor_ids": " ".join(q["relevant"])} for q in labels["queries"]],
              ["query_id", "set", "query", "relevance_criteria", "relevant_count", "relevant_mentor_ids"])
    write_csv(DETAIL / "corpus.csv", corpus_rows, ["synthetic_id", "former_kq_department", "industry", "current_job_title",
              "consent_to_matching", "available_for_mentorship", "embedded", "eligible"])
    write_csv(DETAIL / "per_query_metrics.csv", [{"query_id": q["id"], "set": q["set"], "query": q["query"],
              "relevant_count": q["relevant_count"], "system": system, **{k: q[system][k] for k in
              ("returned", "hits", "precision_at_5", "recall_at_5", "f1_at_5", "reciprocal_rank", "recall_ceiling")}}
              for q in report["queries"] for system, _ in SYSTEMS],
              ["query_id", "set", "query", "relevant_count", "system", "returned", "hits", "precision_at_5", "recall_at_5",
               "f1_at_5", "reciprocal_rank", "recall_ceiling"])
    write_csv(DETAIL / "per_query_rankings.csv", rankings, ["query_id", "set", "system", "rank", "synthetic_id",
              "former_kq_department", "current_job_title", "industry", "semantic_similarity", "relevant"])
    comparison = []
    for scope in report["macro"]:
        for system, label in SYSTEMS:
            m, ci = report["macro"][scope][system], report["confidence_intervals"][scope][system]
            comparison.append({"query_set": scope, "system": label, "queries": sum(1 for q in report["queries"] if scope == "all" or q["set"] == scope),
                               **{key: m[key] for key in METRICS},
                               **{f"{key}_ci95": f"{ci[key][0]:.3f}-{ci[key][1]:.3f}" for key in METRICS}})
    write_csv(DETAIL / "comparison.csv", comparison, ["query_set", "system", "queries", *METRICS, *[f"{k}_ci95" for k in METRICS]])
    write_csv(DETAIL / "significance.csv", report["significance"], ["scope", "a", "b", "metric", "n_queries",
              "n_nonzero_differences", "a_better", "b_better", "mean_difference", "statistic", "p_value"])
    write_csv(DETAIL / "threshold_sweep.csv", report["threshold_sweep"], ["threshold", *METRICS, "mean_results_returned",
              "queries_with_fewer_than_5", "queries_with_no_results", "negative_control_results"])


def markdown(report):
    lines = [
        "# Semantic mentor matching evaluation", "",
        f"Evaluated {report['evaluated_at']} · model `{report['model']}` · k = {report['k']} · "
        f"{report['corpus_size']} eligible synthetic mentors (consenting, available, embedded) · "
        f"similarity threshold {report['similarity_threshold']} · MRR is MRR@5.", "",
        f"Relevance labels are rule-based and frozen in `{report.get('labels', 'evaluation/relevance_labels.json')}`. "
        "**Domain** queries name a former-department area (relevant: matching department or listed skill). "
        "**Transition** queries describe a career move; relevance comes from the mentor's current industry, "
        "organization, job title or skills, which the query usually does not name. "
        "All profiles are fictional, so these figures do not describe performance on real Kenya Airways alumni.", "",
        *([f"Query sets: " + "; ".join(f"**{name}** ({sum(q['set'] == name for q in report['queries'])}) {SET_DESCRIPTIONS[name]}"
                                         for name in list(report["macro"])[:-1]) + ".", ""] if len(report["macro"]) > 3 else []),
        "## Macro averages", "",
        "| Query set | System | P@5 | R@5 | F1@5 | MRR | R@5 ceiling |", "| --- | --- | --- | --- | --- | --- | --- |",
        *[f"| {scope.title()} | {label} | {m['precision_at_5']:.3f} | {m['recall_at_5']:.3f} | {m['f1_at_5']:.3f} | {m['reciprocal_rank']:.3f} | {m['recall_ceiling']:.3f} |"
          for scope in report["macro"]
          for label, m in (("Semantic (BGE + pgvector)", report["macro"][scope]["semantic"]), ("Keyword baseline (TF-IDF)", report["macro"][scope]["keyword_baseline"]),
                           ("Hybrid (BGE candidates + BM25, RRF)", report["macro"][scope]["hybrid"]))], "",
        "R@5 cannot exceed the ceiling shown: with more than five relevant mentors, five results can only recover a fraction of them.", "",
        "## Per query", "",
        "| Set | Query | Relevant | Semantic P@5 | Semantic R@5 | Keyword P@5 | Keyword R@5 | Hybrid P@5 | Hybrid R@5 |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for q in report["queries"]:
        lines.append(f"| {q['set']} | {q['query']} | {q['relevant_count']} | {q['semantic']['precision_at_5']:.2f} | {q['semantic']['recall_at_5']:.2f} | "
                     f"{q['keyword_baseline']['precision_at_5']:.2f} | {q['keyword_baseline']['recall_at_5']:.2f} | "
                     f"{q['hybrid']['precision_at_5']:.2f} | {q['hybrid']['recall_at_5']:.2f} |")
    misses = [q for q in report["queries"] if q["semantic"]["precision_at_5"] < 0.8]
    lines += ["", "## Failure cases (semantic P@5 below 0.8)", ""]
    if not misses:
        lines.append("None.")
    for q in misses:
        wrong = ", ".join(f"{t['synthetic_id']} ({t['department']})" for t in q["semantic"]["top"] if not t["relevant"]) or "fewer than five results above the similarity threshold"
        lines.append(f"- **{q['query']}** returned {q['semantic']['returned']} result(s); not relevant: {wrong}.")
    keys = ("precision_at_5", "recall_at_5", "f1_at_5", "reciprocal_rank")
    wins = all(report["macro"][scope]["hybrid"][k] >= report["macro"][scope]["semantic"][k] for scope in list(report["macro"])[:-1] for k in keys)
    lines += ["", "## Ranking decision", "",
              "The hybrid ranker keeps the semantic candidates (same similarity threshold) and re-orders them with BM25 keyword "
              "scores by reciprocal rank fusion (`services/matching/app/hybrid.py`). It would replace semantic ranking in the live "
              "service only if it matched or beat it on every macro metric in both query sets.", "",
              f"**Result: {'hybrid adopted' if wins else 'semantic ranking kept'}.** " + ("" if wins else
              "Keyword overlap favours mentors who share the member's words (often their old role) over mentors who match "
              "where the member wants to go, which lowers ranking quality on career-transition queries."), ""]
    lines += ["", "## Uncertainty (bootstrap 95% confidence intervals, all 22 queries)", "",
              "| System | P@5 | R@5 | F1@5 | MRR@5 |", "| --- | --- | --- | --- | --- |",
              *[f"| {label} | " + " | ".join(f"{report['macro']['all'][system][k]:.3f} [{report['confidence_intervals']['all'][system][k][0]:.3f}, {report['confidence_intervals']['all'][system][k][1]:.3f}]"
                                             for k in METRICS) + " |" for system, label in SYSTEMS], "",
              f"Queries resampled with replacement {BOOTSTRAP_SAMPLES} times (seed {SEED}).", "",
              "## Paired significance tests (Wilcoxon signed-rank, two-sided)", "",
              "| Query set | Comparison | Metric | Non-zero pairs | A better / B better | Mean difference | p |", "| --- | --- | --- | --- | --- | --- | --- |",
              *[f"| {t['scope']} | {t['a']} vs {t['b']} | {t['metric']} | {t['n_nonzero_differences']} of {t['n_queries']} | {t['a_better']} / {t['b_better']} | {t['mean_difference']:+.3f} | {t['p_value'] if t['p_value'] is not None else 'n/a'} |"
                for t in report["significance"]], "",
              "With 22 queries the tests have little power; a p-value above 0.05 means no reliable difference was detected, not that the systems are equivalent.", "",
              "## Similarity threshold sensitivity (semantic, analysis only)", "",
              "| Threshold | P@5 | R@5 | F1@5 | MRR@5 | Mean results | Queries with < 5 results | Negative-control results |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
              *[f"| {r['threshold']:.2f}{' (production)' if abs(r['threshold'] - report['similarity_threshold']) < 1e-9 else ''} | {r['precision_at_5']:.3f} | {r['recall_at_5']:.3f} | {r['f1_at_5']:.3f} | {r['reciprocal_rank']:.3f} | {r['mean_results_returned']:.2f} | {r['queries_with_fewer_than_5']} | {r['negative_control_results']} |"
                for r in report["threshold_sweep"]], "",
              "P@5 divides by 5 even when fewer results clear the threshold, so a stricter threshold can lower P@5 while removing weak matches.", ""]
    control = report["negative_control"]
    lines += ["", "## Negative control", "",
              f"Off-topic query “{control['query']}” returned {control['semantic_results']} semantic result(s) "
              f"(similarity threshold applied), {control['keyword_results']} keyword result(s) and {control['hybrid_results']} hybrid result(s).", "",
              "## Latency (ms)", "",
              "| System | Timed calls | Mean | Median | p95 | Max |", "| --- | --- | --- | --- | --- | --- |",
              *[f"| {label} | {report['latency'][system]['n']} | {report['latency'][system]['mean_ms']} | {report['latency'][system]['median_ms']} | "
                f"{report['latency'][system]['p95_ms']} | {report['latency'][system]['max_ms']} |"
                for system, label in [*SYSTEMS, ("semantic_repeated", "Semantic, repeated rounds over all labelled queries")] if system in report.get("latency", {})], "",
              f"Semantic: HTTP round trip to the matching service (BGE query encoding + exact pgvector search), "
              f"once per query plus {report.get('latency_rounds', 0)} repeated round(s). Keyword: in-process TF-IDF scoring. "
              "Hybrid: semantic candidates (50) from the service plus in-process BM25 fusion. Same machine, sequential calls.", "",
              *(["## Queries without any relevant mentor in this corpus (not scored)", "",
                 *[f"- {q['id']} ({q['set']}): {q['query']}" for q in report["unanswerable"]], ""] if report.get("unanswerable") else []),
              "## Limitations", "",
              "- Labels are derived from structured fields, not independent human judgement.",
              "- Synthetic biographies follow templates, which can make semantic and keyword signals easier than real profiles.",
              "- Results depend on the configured similarity threshold and current mentor availability.", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--build-labels", action="store_true")
    parser.add_argument("--labels", type=Path, help="labels file (default evaluation/relevance_labels.json)")
    parser.add_argument("--results", type=Path, help="results folder (default evaluation/results)")
    parser.add_argument("--query-set", choices=["original", "expanded"], default="original",
                        help="with --build-labels: the 22 original queries or the 45-query expanded set")
    parser.add_argument("--latency-rounds", type=int, default=0, help="extra timed rounds of production searches")
    args = parser.parse_args()
    if args.labels:
        LABELS = args.labels.resolve()
    if args.results:
        RESULTS = args.results.resolve()
        DETAIL = RESULTS / "matching"
    LATENCY_ROUNDS = max(0, args.latency_rounds)
    if args.build_labels:
        build_labels(EXPANDED_QUERY_SETS if args.query_set == "expanded" else QUERY_SETS)
    else:
        evaluate()
