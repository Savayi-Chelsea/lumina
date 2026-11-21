# Lumina evaluation: how to reproduce

Everything in `results/` and `figures/` is produced by the commands below from the
synthetic dataset. Nothing is entered by hand. The written report is
[`EVALUATION_REPORT.md`](EVALUATION_REPORT.md); findings for the abstract are in
[`ABSTRACT_FINDINGS.md`](ABSTRACT_FINDINGS.md). The 200 → 500-profile scale-up is in
[`DATASET_EXPANSION_REPORT.md`](DATASET_EXPANSION_REPORT.md).

## Prerequisites

```bash
bash scripts/setup.sh            # .env, dependencies, containers, 200 synthetic alumni + embeddings
npm run build                    # production web build (used by the latency and end-to-end tests)
npx next start --port 3000 &     # web app
.venv/bin/python -m uvicorn services.matching.app.main:app --port 8000 &   # matching service
curl http://127.0.0.1:8000/ready # wait for {"status":"ready"} (loads the BGE model)
```

Do not run the profile-events worker separately during step 3; the harness runs its own.

## Commands (in this order)

| # | Evaluation | Command | Output | Time |
| --- | --- | --- | --- | --- |
| 1 | Semantic vs keyword vs hybrid matching | `.venv/bin/python scripts/evaluate_matching.py` | `results/matching_evaluation.{json,md}`, `results/matching/*.csv` | ~20 s |
| 2 | Consent, threshold and ranking correctness | `.venv/bin/python scripts/evaluate_correctness.py` | `results/correctness/*.csv`, `summary.json` | ~1 min |
| 3 | Explanation grounding | `node --no-warnings scripts/evaluate_explanations.mjs` | `results/correctness/explanations*.{csv,json}` | ~5 s |
| 4 | Event-driven re-indexing (stops and restarts Kafka) | `.venv/bin/python scripts/evaluate_event_pipeline.py` | `results/event_pipeline/` | ~4 min |
| 5 | Latency, idle and under load (run on an idle machine) | `node --no-warnings scripts/evaluate_performance.mjs` | `results/performance/` | ~6 min |
| 6 | All automated test suites | `bash scripts/evaluate_test_suites.sh` | `results/tests/` | ~8 min |
| 6b | 200 vs 500-profile comparison (45 queries) | see [`DATASET_EXPANSION_REPORT.md`](DATASET_EXPANSION_REPORT.md#reproduce) | `results/expanded/` | ~10 min (incl. embeddings) |
| 7 | Figures | `.venv/bin/python scripts/evaluation_charts.py && node scripts/render_charts.mjs` | `figures/*.svg`, `figures/*.png` | ~10 s |

The relevance labels in `relevance_labels.json` are frozen. Rebuild them only if the
dataset changes (`scripts/evaluate_matching.py --build-labels`), and say so in the report.

## What is automated and what is manual

| Area | Status |
| --- | --- |
| Matching quality (P@5, R@5, F1@5, MRR@5), statistics, threshold analysis | Automated, completed |
| Ranking, consent, availability, threshold and top-k correctness | Automated, completed |
| Explanation grounding | Automated, completed |
| Kafka delivery, duplicates, malformed events, broker and worker outages, consent changes | Automated, completed |
| Latency and errors, idle and under concurrent matching load | Automated, completed (single shared machine) |
| Usability (task success, time, SEQ, SUS) | **Manual: prepared, not yet run.** See `usability/` |
| Real (non-synthetic) alumni data, production cloud deployment | Not evaluated |

## Dataset

- `data/synthetic_alumni.csv`: 200 fictional former-KQ profiles across 12 departments
  (`results/matching/corpus.csv` lists each one with its consent, availability and
  embedding status: 169 consent to matching, 133 of those are available).
- `relevance_labels.json` / `results/matching/queries.csv`: 22 labelled career queries
  (12 domain, 10 career-transition) with their relevant mentor IDs, derived by documented
  rules from structured profile fields.
