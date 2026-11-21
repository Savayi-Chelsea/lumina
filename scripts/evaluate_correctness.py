"""Consent, eligibility, threshold and ranking correctness of the live matching service.

  1. Start the matching service (uvicorn services.matching.app.main:app --port 8000).
  2. .venv/bin/python scripts/evaluate_correctness.py

Every check runs against the real seeded corpus through the real HTTP API, and is
compared with an independent re-computation: the same BGE model is loaded here,
and exact cosine similarity is computed with NumPy over the vectors stored in
PostgreSQL, applying the documented rules (consenting AND available mentors,
similarity >= threshold, highest first, ties by profile id). Nothing is written to
the database. Results go to evaluation/results/correctness/.

Checks
  A. Ranking: the service's results equal the independent exact ranking (ids, order, scores).
  B. Eligibility: every returned mentor is consenting, available and embedded.
  C. Exclusion probes: a query made from an excluded mentor's own headline (which would
     rank that mentor near the top if the filter leaked) never returns them; the same probe
     for eligible mentors does (showing the probe is discriminating).
  D. Threshold: all scores >= threshold; stricter thresholds return nested, shorter lists.
  E. top-k: results for k are the first k of the results for a larger k.
  F. Recommendations (/mentors/recommend): never the member themself, never excluded ids,
     only eligible mentors, scores >= 0.6.
"""
import csv
import json
import os
import random
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from local_database import ROOT, local_dsn  # noqa: E402
from services.matching.app.indexing import MODEL_NAME, BGEEncoder  # noqa: E402
from services.matching.app.search import QUERY_INSTRUCTION, RECOMMEND_THRESHOLD, SearchRequest  # noqa: E402

OUT = ROOT / "evaluation/results/correctness"
BASE = os.getenv("MATCHING_SERVICE_URL", "http://127.0.0.1:8000").rstrip("/")
SCORE_TOLERANCE = 1e-4   # float32 storage in pgvector vs float64 here
TIE_EPSILON = 1e-6       # scores closer than this may legitimately swap order
SEED = 20261117


def post(path, body):
    request = urllib.request.Request(f"{BASE}/{path}", method="POST", headers={"Content-Type": "application/json"},
                                     data=json.dumps(body).encode())
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def search(query, top_k=5, threshold=None):
    body = {"query": query, "top_k": top_k}
    if threshold is not None:
        body["similarity_threshold"] = threshold
    return [(r["profile_id"], r["similarity_score"]) for r in post("mentors/search", body)["results"]]


def load(conn):
    profiles = conn.execute("""
        SELECT p.id::text AS profile_id, split_part(u.email, '@', 1) AS label, p.headline,
            COALESCE(m.consent_to_matching, FALSE) AS consent, COALESCE(m.available_for_mentorship, FALSE) AS available,
            e.embedding::text AS embedding, e.model_name
        FROM profiles p JOIN users u ON u.id = p.user_id
        LEFT JOIN mentorship_preferences m ON m.profile_id = p.id
        LEFT JOIN profile_embeddings e ON e.profile_id = p.id
        ORDER BY p.id""").fetchall()
    for p in profiles:
        p["vector"] = np.array(json.loads(p.pop("embedding")), dtype=np.float64) if p["embedding"] else None
        p["eligible"] = p["consent"] and p["available"] and p["vector"] is not None and p["model_name"] == MODEL_NAME
    return profiles


def exact_ranking(query_vector, candidates, threshold, top_k):
    scored = [(p["profile_id"], float(p["vector"] @ query_vector)) for p in candidates]
    kept = sorted(((pid, s) for pid, s in scored if s >= threshold), key=lambda item: (-item[1], item[0]))
    return kept[:top_k]


def same_ranking(service, expected):
    """Equal ids in equal order, except swaps between scores closer than TIE_EPSILON."""
    if len(service) != len(expected):
        return False, f"length {len(service)} vs {len(expected)}"
    expected_scores = dict(expected)
    for (sid, sscore), (eid, escore) in zip(service, expected):
        if sid not in expected_scores or abs(sscore - expected_scores[sid]) > SCORE_TOLERANCE:
            return False, "score or membership differs"
        if sid != eid and abs(sscore - escore) > TIE_EPSILON:
            return False, "order differs"
    return True, ""


def write_csv(name, rows):
    if not rows:
        return
    with (OUT / name).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main():
    labels = json.loads((ROOT / "evaluation/relevance_labels.json").read_text(encoding="utf-8"))
    queries = [(q["id"], q["query"]) for q in labels["queries"]]
    queries.append(("control", "Astrophysics research on black holes and galaxy formation."))
    with psycopg.connect(local_dsn(), row_factory=dict_row) as conn:
        profiles = load(conn)
    by_id = {p["profile_id"]: p for p in profiles}
    eligible = [p for p in profiles if p["eligible"]]
    threshold = post("mentors/search", {"query": "aviation careers", "top_k": 1})["similarity_threshold"]
    print(f"Corpus: {len(profiles)} profiles, {len(eligible)} eligible; service threshold {threshold}. Loading BGE locally…")
    encoder = BGEEncoder()

    def encode_query(text):
        return np.array(encoder.encode(QUERY_INSTRUCTION + SearchRequest(query=text).query), dtype=np.float64)

    returned_ids, results = set(), {}

    # A. Ranking at production settings (k=5) and over a long list (k=50, no threshold).
    ranking_rows = []
    for qid, text in queries:
        vector = encode_query(text)
        for top_k, t in ((5, threshold), (50, -1.0)):
            service = search(text, top_k, None if t == threshold else t)
            expected = exact_ranking(vector, eligible, t, top_k)
            ok, why = same_ranking(service, expected)
            returned_ids.update(pid for pid, _ in service)
            max_diff = max((abs(s - dict(expected).get(pid, 99)) for pid, s in service), default=0.0)
            ranking_rows.append({"query_id": qid, "top_k": top_k, "threshold": t, "service_results": len(service),
                                 "expected_results": len(expected), "identical": ok, "max_score_difference": f"{max_diff:.2e}", "note": why})
    results["A_ranking"] = {"checks": len(ranking_rows), "identical": sum(r["identical"] for r in ranking_rows)}

    # B. Eligibility of everything returned anywhere in this run (A, C, D, E).
    # C. Exclusion probes.
    rng = random.Random(SEED)
    unavailable = [p for p in profiles if p["consent"] and not p["available"] and p["headline"]]
    withdrawn = [p for p in profiles if not p["consent"] and p["headline"] and p["label"].startswith("alum-")]
    controls = rng.sample([p for p in eligible if p["headline"]], k=min(len(eligible), max(len(unavailable), len(withdrawn))))
    probe_rows = []
    for group, members in (("consenting but unavailable", unavailable), ("consent withdrawn / never given", withdrawn), ("eligible (control)", controls)):
        for p in members:
            service = search(p["headline"], 50, -1.0)
            returned_ids.update(pid for pid, _ in service)
            ids = [pid for pid, _ in service]
            position = ids.index(p["profile_id"]) + 1 if p["profile_id"] in ids else None
            unfiltered_rank = None
            if p["vector"] is not None:  # where it would rank if the filter did not exist
                vector = encode_query(p["headline"])
                pool = eligible + ([p] if not p["eligible"] else [])
                ranked = exact_ranking(vector, pool, -1.0, len(pool))
                unfiltered_rank = [pid for pid, _ in ranked].index(p["profile_id"]) + 1
            probe_rows.append({"group": group, "mentor": p["label"], "has_embedding": p["vector"] is not None,
                               "returned_at_rank": position or "", "rank_if_unfiltered": unfiltered_rank or ""})
    excluded_probes = [r for r in probe_rows if r["group"] != "eligible (control)"]
    control_probes = [r for r in probe_rows if r["group"] == "eligible (control)"]
    results["C_exclusion_probes"] = {
        "unavailable_probes": len(unavailable), "withdrawn_probes": len(withdrawn),
        "excluded_mentors_returned": sum(1 for r in excluded_probes if r["returned_at_rank"]),
        "withdrawn_with_embedding_left": sum(1 for p in withdrawn if p["vector"] is not None),
        "unavailable_that_would_rank_top5_unfiltered": sum(1 for r in excluded_probes if r["rank_if_unfiltered"] and r["rank_if_unfiltered"] <= 5),
        "control_probes": len(control_probes),
        "control_found_rank1": sum(1 for r in control_probes if r["returned_at_rank"] == 1),
        "control_found_top5": sum(1 for r in control_probes if r["returned_at_rank"] and r["returned_at_rank"] <= 5),
    }

    # D. Threshold filtering and nesting.  E. top-k prefixes.
    threshold_rows, topk_rows = [], []
    for qid, text in queries:
        previous = None
        for t in (0.3, 0.4, 0.5, 0.6, 0.7):
            current = search(text, 50, t)
            returned_ids.update(pid for pid, _ in current)
            below = sum(1 for _, s in current if s < t)
            nested = previous is None or [pid for pid, _ in current] == [pid for pid, _ in previous][:len(current)]
            threshold_rows.append({"query_id": qid, "threshold": t, "results": len(current), "scores_below_threshold": below,
                                   "nested_in_lower_threshold": nested})
            previous = current
        longest = [pid for pid, _ in search(text, 50, 0.3)]
        for k in (1, 3, 5, 10, 20):
            ids = [pid for pid, _ in search(text, k, 0.3)]
            topk_rows.append({"query_id": qid, "top_k": k, "results": len(ids), "within_limit": len(ids) <= k,
                              "prefix_of_k50": ids == longest[:len(ids)]})
    results["D_threshold"] = {"checks": len(threshold_rows), "scores_below_threshold": sum(r["scores_below_threshold"] for r in threshold_rows),
                              "non_nested": sum(not r["nested_in_lower_threshold"] for r in threshold_rows)}
    results["E_top_k"] = {"checks": len(topk_rows), "over_limit": sum(not r["within_limit"] for r in topk_rows),
                          "not_prefix": sum(not r["prefix_of_k50"] for r in topk_rows)}

    # F. Recommendations for mentors and non-mentors alike.
    members = rng.sample([p for p in profiles if p["label"].startswith("alum-")], k=40)
    rec_rows = []
    for p in members:
        exclude = [q["profile_id"] for q in rng.sample(eligible, k=3)]
        recs = post("mentors/recommend", {"profile_id": p["profile_id"], "top_k": 4, "exclude": exclude})["results"]
        ids = [r["profile_id"] for r in recs]
        returned_ids.update(ids)
        rec_rows.append({"member": p["label"], "results": len(ids), "includes_self": p["profile_id"] in ids,
                         "includes_excluded": bool(set(ids) & set(exclude)),
                         "ineligible_returned": sum(1 for pid in ids if not by_id[pid]["eligible"]),
                         "below_threshold": sum(1 for r in recs if r["similarity_score"] < RECOMMEND_THRESHOLD)})
    results["F_recommendations"] = {"members": len(rec_rows), "with_results": sum(1 for r in rec_rows if r["results"]),
                                    "self_returned": sum(r["includes_self"] for r in rec_rows),
                                    "excluded_returned": sum(r["includes_excluded"] for r in rec_rows),
                                    "ineligible_returned": sum(r["ineligible_returned"] for r in rec_rows),
                                    "below_threshold": sum(r["below_threshold"] for r in rec_rows)}

    ineligible = sorted(by_id[pid]["label"] for pid in returned_ids if not by_id[pid]["eligible"])
    results["B_eligibility"] = {"distinct_mentors_returned": len(returned_ids), "ineligible_returned": len(ineligible),
                                "eligible_pool": len(eligible), "excluded_pool": len(profiles) - len(eligible)}
    passed = (results["A_ranking"]["identical"] == results["A_ranking"]["checks"]
              and not results["B_eligibility"]["ineligible_returned"]
              and not results["C_exclusion_probes"]["excluded_mentors_returned"]
              and not results["C_exclusion_probes"]["withdrawn_with_embedding_left"]
              and not results["D_threshold"]["scores_below_threshold"] and not results["D_threshold"]["non_nested"]
              and not results["E_top_k"]["over_limit"] and not results["E_top_k"]["not_prefix"]
              and not any(results["F_recommendations"][k] for k in ("self_returned", "excluded_returned", "ineligible_returned", "below_threshold")))
    summary = {"evaluated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "model": MODEL_NAME,
               "similarity_threshold": threshold, "recommend_threshold": RECOMMEND_THRESHOLD, "all_checks_passed": passed, **results}
    OUT.mkdir(parents=True, exist_ok=True)
    write_csv("ranking_verification.csv", ranking_rows)
    write_csv("exclusion_probes.csv", probe_rows)
    write_csv("threshold_checks.csv", threshold_rows)
    write_csv("top_k_checks.csv", topk_rows)
    write_csv("recommendation_checks.csv", rec_rows)
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
