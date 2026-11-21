"""Compare matching results on the 200-profile and 500-profile corpora.

  .venv/bin/python scripts/compare_dataset_sizes.py

Reads the two expanded runs written by scripts/evaluate_matching.py
(evaluation/results/expanded/dataset_200 and dataset_500) and writes
evaluation/results/expanded/comparison/: subsets.csv, by_set.csv, per_query.csv,
latency.csv, significance.csv and comparison.md. No new searches are made here.

Like-for-like subsets:
  original_22   the 22 original queries (same queries, labels recomputed per corpus by the same rules)
  common        the queries answerable (at least one relevant mentor) in both corpora
  all           every answerable query in each corpus (33 at 200, 45 at 500; not paired)
Recall@5 cannot exceed min(5, relevant)/relevant, and relevant sets grow with the corpus, so
"normalised R@5" (hits / min(5, relevant)) is reported alongside R@5 for cross-corpus comparison.
"""
import csv
import json
import random
from pathlib import Path

from scipy.stats import wilcoxon

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "evaluation/results/expanded"
OUT = BASE / "comparison"
SYSTEMS = (("semantic", "Semantic"), ("keyword_baseline", "Keyword (TF-IDF)"), ("hybrid", "Hybrid (BGE + BM25)"))
METRICS = ("precision_at_5", "recall_at_5", "normalised_recall_at_5", "f1_at_5", "reciprocal_rank")
SEED, SAMPLES = 20261117, 10000


def load(corpus):
    report = json.loads((BASE / f"dataset_{corpus}/matching_evaluation.json").read_text(encoding="utf-8"))
    for q in report["queries"]:
        for system, _ in SYSTEMS:
            m = q[system]
            m["normalised_recall_at_5"] = m["hits"] / min(5, q["relevant_count"]) if q["relevant_count"] else 0.0
    return report


def mean(values):
    return round(sum(values) / len(values), 4) if values else None


def ci(values):
    rng = random.Random(SEED)
    means = sorted(sum(values[rng.randrange(len(values))] for _ in values) / len(values) for _ in range(SAMPLES))
    return f"{means[int(0.025 * SAMPLES)]:.3f}-{means[int(0.975 * SAMPLES) - 1]:.3f}"


def write(name, rows):
    with (OUT / name).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def test(x, y):
    differences = [a - b for a, b in zip(x, y) if abs(a - b) > 1e-12]
    if not differences:
        return {"n_nonzero": 0, "p_value": None}
    return {"n_nonzero": len(differences), "p_value": round(float(wilcoxon(x, y, zero_method="wilcox").pvalue), 4)}


def main():
    r200, r500 = load("200"), load("500")
    q200, q500 = {q["id"]: q for q in r200["queries"]}, {q["id"]: q for q in r500["queries"]}
    original = [q["id"] for q in json.loads((ROOT / "evaluation/relevance_labels.json").read_text(encoding="utf-8"))["queries"]]
    common = [qid for qid in q500 if qid in q200]
    subsets = {"original_22": original, "common": common}
    OUT.mkdir(parents=True, exist_ok=True)

    rows = []
    for subset, ids in [*subsets.items(), ("all", None)]:
        for corpus, queries in (("200", q200), ("500", q500)):
            chosen = [queries[i] for i in (ids if ids is not None else queries)]
            for system, label in SYSTEMS:
                row = {"subset": subset, "corpus": corpus, "eligible_mentors": (r200 if corpus == "200" else r500)["corpus_size"],
                       "system": label, "queries": len(chosen)}
                row.update({m: mean([q[system][m] for q in chosen]) for m in METRICS})
                row["mean_relevant_per_query"] = mean([q["relevant_count"] for q in chosen])
                row["f1_at_5_ci95"] = ci([q[system]["f1_at_5"] for q in chosen])
                row["reciprocal_rank_ci95"] = ci([q[system]["reciprocal_rank"] for q in chosen])
                rows.append(row)
    write("subsets.csv", rows)

    by_set = []
    for corpus, report in (("200", r200), ("500", r500)):
        for scope in report["macro"]:
            chosen = [q for q in report["queries"] if scope == "all" or q["set"] == scope]
            for system, label in SYSTEMS:
                by_set.append({"corpus": corpus, "set": scope, "system": label, "queries": len(chosen),
                               **{m: mean([q[system][m] for q in chosen]) for m in METRICS}})
    write("by_set.csv", by_set)

    per_query = []
    for qid, q in q500.items():
        before = q200.get(qid)
        for system, label in SYSTEMS:
            entry = {"query_id": qid, "set": q["set"], "system": label, "relevant_200": before["relevant_count"] if before else 0,
                     "relevant_500": q["relevant_count"]}
            for m in ("precision_at_5", "normalised_recall_at_5", "f1_at_5", "reciprocal_rank"):
                entry[f"{m}_200"] = round(before[system][m], 4) if before else ""
                entry[f"{m}_500"] = round(q[system][m], 4)
                entry[f"{m}_change"] = round(q[system][m] - before[system][m], 4) if before else ""
            per_query.append(entry)
    write("per_query.csv", per_query)

    latency = [{"corpus": corpus, "eligible_mentors": report["corpus_size"], "system": name, **stats}
               for corpus, report in (("200", r200), ("500", r500)) for name, stats in report["latency"].items()]
    write("latency.csv", latency)

    tests = []
    for subset, ids in subsets.items():
        for system, label in SYSTEMS:  # corpus effect, paired by query
            for metric in ("precision_at_5", "normalised_recall_at_5", "reciprocal_rank"):
                x, y = [q500[i][system][metric] for i in ids], [q200[i][system][metric] for i in ids]
                tests.append({"comparison": "500 vs 200 corpus", "subset": subset, "system": label, "metric": metric,
                              "queries": len(ids), "mean_500": mean(x), "mean_200": mean(y), **test(x, y)})
    for corpus, queries in (("200", q200), ("500", q500)):  # systems within each corpus
        chosen = list(queries.values())
        for a, b in (("semantic", "keyword_baseline"), ("semantic", "hybrid")):
            for metric in ("f1_at_5", "reciprocal_rank"):
                x, y = [q[a][metric] for q in chosen], [q[b][metric] for q in chosen]
                tests.append({"comparison": f"{a} vs {b}", "subset": f"all at {corpus}", "system": "", "metric": metric,
                              "queries": len(chosen), "mean_500": mean(x) if corpus == "500" else "", "mean_200": mean(x) if corpus == "200" else "",
                              **test(x, y)})
    write("significance.csv", tests)
    (OUT / "comparison.md").write_text(markdown(rows, by_set, latency, tests, r200, r500), encoding="utf-8")
    print((OUT / "comparison.md").read_text(encoding="utf-8"))


def markdown(rows, by_set, latency, tests, r200, r500):
    fmt = lambda v: "–" if v is None else f"{v:.3f}"
    lines = ["# 200- vs 500-profile matching comparison", "",
             f"200-profile corpus: {r200['corpus_size']} eligible mentors; 500-profile corpus: {r500['corpus_size']} eligible mentors. "
             f"Same model, threshold ({r500['similarity_threshold']}), k = 5, code and rules. "
             f"Unanswerable at 200 (no relevant mentor, not scored): {', '.join(q['id'] for q in r200['unanswerable']) or 'none'}.", "",
             "| Subset | Corpus | System | Queries | P@5 | R@5 | Normalised R@5 | F1@5 [95% CI] | MRR@5 [95% CI] | Mean relevant |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    lines += [f"| {r['subset']} | {r['corpus']} | {r['system']} | {r['queries']} | {fmt(r['precision_at_5'])} | {fmt(r['recall_at_5'])} | "
              f"{fmt(r['normalised_recall_at_5'])} | {fmt(r['f1_at_5'])} [{r['f1_at_5_ci95']}] | {fmt(r['reciprocal_rank'])} [{r['reciprocal_rank_ci95']}] | "
              f"{r['mean_relevant_per_query']:.1f} |" for r in rows]
    lines += ["", "## By query type", "", "| Corpus | Query set | Queries | Semantic F1@5 | Keyword F1@5 | Hybrid F1@5 | Semantic MRR@5 | Keyword MRR@5 | Hybrid MRR@5 |",
              "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    grouped = {}
    for r in by_set:
        grouped.setdefault((r["corpus"], r["set"]), {})[r["system"]] = r
    for (corpus, scope), systems in grouped.items():
        s, k, h = (systems[label] for _, label in SYSTEMS)
        lines.append(f"| {corpus} | {scope} | {s['queries']} | {fmt(s['f1_at_5'])} | {fmt(k['f1_at_5'])} | {fmt(h['f1_at_5'])} | "
                     f"{fmt(s['reciprocal_rank'])} | {fmt(k['reciprocal_rank'])} | {fmt(h['reciprocal_rank'])} |")
    lines += ["", "## Latency (ms, same machine, sequential)", "", "| Corpus | System | Timed calls | Median | p95 | Max |", "| --- | --- | --- | --- | --- | --- |"]
    lines += [f"| {r['corpus']} | {r['system']} | {r['n']} | {r['median_ms']} | {r['p95_ms']} | {r['max_ms']} |" for r in latency]
    lines += ["", "`semantic_repeated` times the production search for all 45 labelled queries in 5 rounds on each corpus (identical query set).", "",
              "## Paired Wilcoxon signed-rank tests", "", "| Comparison | Subset | System | Metric | Queries | Mean (500) | Mean (200) | Non-zero pairs | p |",
              "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    lines += [f"| {t['comparison']} | {t['subset']} | {t['system']} | {t['metric']} | {t['queries']} | {t['mean_500']} | {t['mean_200']} | "
              f"{t['n_nonzero']} | {t['p_value'] if t['p_value'] is not None else 'n/a'} |" for t in tests]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
