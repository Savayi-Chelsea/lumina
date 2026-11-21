# Scaling the matching evaluation from 200 to 500 profiles

This extends the Chapter 4 evaluation (`EVALUATION_REPORT.md`) to a 500-profile synthetic
dataset and a 45-query labelled set. The matching system (model, similarity threshold,
ranking code) was not changed. Every number comes from files in `results/expanded/`;
the commands are at the end.

## 1. Dataset expansion

| | Baseline (demo) | Expanded |
| --- | --- | --- |
| Profiles | 200 (ALUM-001–200) | 500 (the same 200 unchanged + ALUM-201–500) |
| Departments | 12 | 12 (25 new profiles each) |
| Eligible mentors (consent + available + embedded) | 133 (66.5%) | 325 (65.0%) |
| Consent / availability | 84.5% / 80.0% | 83.2% / 79.4% |
| Industries / distinct skills / distinct current titles | 12 / 84 / 70 | 20 / 140 / 143 |

The 300 new profiles come from a separate seeded generator
(`scripts/synthetic_expansion_500.py`). It gives each person an experience level (61 early,
136 mid, 70 senior, 33 executive) and one of 35 post-KQ career paths: 44 stayed in aviation,
160 moved to an adjacent field and 96 changed career. Titles, skills, mentorship topics and
dated work histories follow from those choices. Six automated tests check the dataset: the
200 baseline rows are unchanged, generation is deterministic, the departments are balanced,
consent and availability rates are realistic, the new profiles are diverse, and each
profile is internally consistent (300 per-profile checks).
Details: `datasets/alumni_500/README.md`.

**Separation from the demo.** The 500 profiles live in a separate local database
(`lumina_eval_500`) served by a second, identically configured matching-service instance.
The demo database, its 200 profiles, the web application and all existing tests are
unchanged.

## 2. Labelled queries: 22 → 45

The original 22 queries (12 domain, 10 career-transition) are kept unchanged, and 23 new ones
were added in five categories:

| Set | Queries | Relevance rule (any criterion) |
| --- | --- | --- |
| domain | 12 (original) | former department or listed skills |
| skill | 6 | mentor lists a named skill (e.g. Kubernetes, IFRS, ISO 9001) |
| transition | 15 (10 original + 5) | current industry, organisation, title or skills of the destination |
| leadership | 5 | leadership skills or a senior title |
| industry | 4 | current industry (tourism, government, agriculture, real estate) |
| broad | 3 | a mentorship topic, title or skill that addresses the need |

The new queries and rules were written before any expanded evaluation was run, and they are
applied unchanged to both corpora. The rule-based labelling covers every eligible mentor,
so the expanded labels include all relevant mentors in each corpus by construction. Two
checks confirmed the labels:
- On the 200-profile corpus, the original 22 queries reproduce the frozen original labels exactly.
- Every mentor relevant at 200 is still relevant at 500.

Twelve new queries have no relevant mentor in the 200-profile corpus, because no baseline
profile works in NGOs, tourism, government, product management and so on. They are reported
as unanswerable there rather than scored as zeros: 33 queries are scored at 200 and all 45
at 500.

## 3. Method

The `evaluate_matching.py` used for the published results was extended, not replaced. Its
default run still reproduces the published 22-query results exactly. Both corpora use the
same model (BGE base v1.5), similarity threshold (0.50), k = 5, keyword baseline (TF-IDF),
hybrid ranker (BM25 + reciprocal-rank fusion) and code. The runs were sequential on the
same machine.

Metrics are P@5, R@5, F1@5 and MRR@5, with bootstrap 95% confidence intervals and paired
Wilcoxon tests. Relevant sets grow with the corpus, so R@5 is capped at
min(5, relevant) / relevant. Normalised R@5 (hits ÷ min(5, relevant)) is therefore also
reported for comparisons across corpora. For latency, every query was timed once per
system, and production searches were timed for all 45 queries in 5 further rounds per
corpus (225 calls each).

## 4. Results

### 4.1 Same 22 original queries, 200 vs 500 profiles

| System | P@5 (200 → 500) | Normalised R@5 | MRR@5 | F1@5 |
| --- | --- | --- | --- | --- |
| **Semantic** | **0.827 → 0.936** | 0.864 → 0.936 | **0.898 → 1.000** | 0.567 → 0.332 |
| Keyword (TF-IDF) | 0.773 → 0.836 | 0.791 → 0.836 | 0.849 → 0.901 | 0.510 → 0.281 |
| Hybrid | 0.809 → 0.909 | 0.843 → 0.909 | 0.856 → 0.947 | 0.552 → 0.319 |

*Mean relevant mentors per query: 10.2 → 25.7. Figure 4.6.*

- **Precision and MRR:** with more mentors available, every system ranked more relevant
  mentors in its top five. Semantic precision rose significantly (P@5 0.827 → 0.936,
  Wilcoxon p = 0.041), and every original query's first result was relevant (MRR@5 = 1.000).
- **Semantic lead over keyword:** it widened from +0.054 to +0.100 in P@5.
- **F1@5 and R@5:** both fell for every system. This is not worse ranking. The relevant sets
  are about 2.5 times larger, so five results recover a smaller share of them; normalised
  recall rose.

### 4.2 All answerable queries

| Corpus | Queries | System | P@5 | R@5 | F1@5 [95% CI] | MRR@5 [95% CI] |
| --- | --- | --- | --- | --- | --- | --- |
| 200 | 33 | Semantic | 0.721 | 0.444 | 0.519 [0.430–0.600] | 0.818 [0.682–0.932] |
| 200 | 33 | Keyword | 0.751 | 0.484 | 0.554 [0.461–0.640] | 0.838 [0.717–0.939] |
| 200 | 33 | Hybrid | 0.739 | 0.472 | 0.542 [0.457–0.620] | 0.819 [0.692–0.924] |
| 500 | 45 | Semantic | 0.813 | 0.310 | 0.397 [0.330–0.467] | 0.927 [0.850–0.985] |
| 500 | 45 | Keyword | 0.831 | 0.279 | 0.378 [0.305–0.453] | 0.918 [0.841–0.978] |
| 500 | 45 | Hybrid | 0.844 | 0.309 | 0.401 [0.330–0.473] | 0.941 [0.874–0.989] |

Over the full mixed query sets the three systems are close, and no overall difference is
statistically significant. At 500 profiles, semantic vs keyword gives p = 0.70 for F1@5 and
p = 0.78 for MRR@5.

### 4.3 By query type (500 profiles; Figure 4.7)

| Set | Queries | Semantic F1@5 | Keyword F1@5 | Hybrid F1@5 | Semantic MRR@5 | Keyword MRR@5 |
| --- | --- | --- | --- | --- | --- | --- |
| domain | 12 | 0.289 | 0.289 | 0.289 | 1.000 | 1.000 |
| skill | 6 | 0.472 | 0.580 | 0.580 | 1.000 | 1.000 |
| **transition** | **15** | **0.491** | 0.324 | 0.428 | **1.000** | 0.789 |
| leadership | 5 | 0.156 | 0.224 | 0.176 | 0.707 | 1.000 |
| industry | 4 | 0.783 | 0.883 | 0.833 | 1.000 | 1.000 |
| broad | 3 | 0.098 | 0.185 | 0.148 | 0.400 | 0.833 |

- **Career transitions, Lumina's core use case, favour semantic matching.** At 500 profiles
  semantic scored higher F1@5 on every one of the 8 transition queries where the methods
  differed (F1@5 0.491 vs 0.324, Wilcoxon p = 0.012), and its first result was always
  relevant. At 200 profiles the same direction was not significant (p = 0.20).
- **Keyword matching wins where the query names the exact attribute the label rule checks.**
  This covers skills (Kubernetes, IFRS), leadership skill tags, industries and topic phrases.
  Semantic search ranks by the meaning of the whole profile, which places a mentor whose
  story fits above one who merely lists the tag. The rule-based labels count only the tag.
- **Hybrid** was best overall on the 500-profile corpus by small margins (F1@5 0.401, MRR@5
  0.941) but lower than semantic on transition queries. Under the original adoption rule
  (adopt only if it equals or beats semantic on every metric in every query set), semantic
  ranking stays in production.

### 4.4 Latency (Figure 4.8)

| Corpus | Eligible mentors | Semantic median | Semantic p95 | Hybrid median | Hybrid p95 | Keyword median |
| --- | --- | --- | --- | --- | --- | --- |
| 200 | 133 | 88.5 ms | 110.0 ms | 90.4 ms | 108.1 ms | 1.6 ms |
| 500 | 325 | 91.0 ms | 111.2 ms | 92.5 ms | 110.8 ms | 1.9 ms |

*Semantic: 225 timed production searches per corpus over the same 45 queries.*

Increasing the eligible corpus 2.4 times added about 2–3 ms to the median and 1 ms to p95.
Exact cosine search over a few hundred vectors is cheap relative to the fixed per-query cost.

## 5. Changes made (all documented; nothing in the running application changed)

| File | Change |
| --- | --- |
| `scripts/synthetic_expansion_500.py`, `scripts/generate_evaluation_dataset.py` | New: deterministic generator for ALUM-201–500, assembling the 500-profile dataset |
| `scripts/seed_evaluation_dataset.py` | New: seeds a `lumina_eval_*` database; refuses the demo database |
| `scripts/local_database.py` | The local-only guard also accepts loopback databases named `lumina_eval_*` (still refuses remote hosts and other names) |
| `scripts/evaluate_matching.py` | Options `--labels`, `--results`, `--query-set expanded`, `--latency-rounds`; 23 new queries; a `topics` rule; unanswerable queries reported, not scored; latency recorded. Default output unchanged (verified identical) |
| `scripts/compare_dataset_sizes.py` | New: the 200 vs 500 comparison (subsets, query types, latency, paired tests) |
| `scripts/evaluation_charts.py` | Figures 4.6–4.8 |
| `tests/synthetic/test_evaluation_dataset.py`, `tests/registry/test_registry_tools.py` | Dataset consistency tests; database-guard test |
| `evaluation/relevance_labels_expanded_{200,500}.json`, `evaluation/datasets/alumni_500/` | Labels and dataset |

## 6. Limitations

- **Synthetic profiles and rule-based labels.** The new profiles are template-generated and
  more varied than the baseline, but still synthetic. Labels test whether a mentor *has* a
  tagged attribute, which structurally favours keyword matching on skill, leadership,
  industry and broad queries. Human relevance judgements would be a fairer test of whether a
  semantically similar mentor is useful.
- **Small groups.** Several query types have only 3–6 queries, so per-type results are
  indicative; only the transition result is statistically significant.
- **Recall depends on corpus size.** R@5 and F1@5 are not comparable across corpora;
  P@5, MRR@5 and normalised R@5 are.
- **Latency** was measured on one 4-vCPU development machine, sequentially and at small
  scale. It shows that corpus size has little effect up to a few hundred mentors; it does not
  predict behaviour at tens of thousands of profiles, where an approximate vector index
  would be needed.

## Reproduce

```bash
.venv/bin/python scripts/generate_evaluation_dataset.py
docker exec lumina-postgres createdb -U lumina lumina_eval_500
docker exec lumina-postgres psql -U lumina -d lumina_eval_500 -q -f /docker-entrypoint-initdb.d/init.sql -f /docker-entrypoint-initdb.d/schema.sql
export EVAL_DB="postgresql://lumina:<POSTGRES_PASSWORD>@localhost:5432/lumina_eval_500"
DATABASE_URL=$EVAL_DB .venv/bin/python scripts/seed_evaluation_dataset.py
DATABASE_URL=$EVAL_DB .venv/bin/python scripts/index_profile_embeddings.py
.venv/bin/python -m uvicorn services.matching.app.main:app --port 8000 &                       # 200-profile demo database
DATABASE_URL=$EVAL_DB .venv/bin/python -m uvicorn services.matching.app.main:app --port 8001 &  # 500-profile evaluation database
.venv/bin/python scripts/evaluate_matching.py --build-labels --query-set expanded --labels evaluation/relevance_labels_expanded_200.json
DATABASE_URL=$EVAL_DB .venv/bin/python scripts/evaluate_matching.py --build-labels --query-set expanded --labels evaluation/relevance_labels_expanded_500.json
MATCHING_SERVICE_URL=http://127.0.0.1:8000 .venv/bin/python scripts/evaluate_matching.py \
  --labels evaluation/relevance_labels_expanded_200.json --results evaluation/results/expanded/dataset_200 --latency-rounds 5
DATABASE_URL=$EVAL_DB MATCHING_SERVICE_URL=http://127.0.0.1:8001 .venv/bin/python scripts/evaluate_matching.py \
  --labels evaluation/relevance_labels_expanded_500.json --results evaluation/results/expanded/dataset_500 --latency-rounds 5
.venv/bin/python scripts/compare_dataset_sizes.py
.venv/bin/python scripts/evaluation_charts.py && node scripts/render_charts.mjs
```
