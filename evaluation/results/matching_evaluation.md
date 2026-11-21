# Semantic mentor matching evaluation

Evaluated 2026-11-17T14:41:58+00:00 · model `BAAI/bge-base-en-v1.5` · k = 5 · 133 eligible synthetic mentors (consenting, available, embedded) · similarity threshold 0.5 · MRR is MRR@5.

Relevance labels are rule-based and frozen in `evaluation/relevance_labels.json`. **Domain** queries name a former-department area (relevant: matching department or listed skill). **Transition** queries describe a career move; relevance comes from the mentor's current industry, organization, job title or skills, which the query usually does not name. All profiles are fictional, so these figures do not describe performance on real Kenya Airways alumni.

## Macro averages

| Query set | System | P@5 | R@5 | F1@5 | MRR | R@5 ceiling |
| --- | --- | --- | --- | --- | --- | --- |
| Domain | Semantic (BGE + pgvector) | 1.000 | 0.475 | 0.637 | 1.000 | 0.475 |
| Domain | Keyword baseline (TF-IDF) | 1.000 | 0.475 | 0.637 | 1.000 | 0.475 |
| Domain | Hybrid (BGE candidates + BM25, RRF) | 1.000 | 0.475 | 0.637 | 1.000 | 0.475 |
| Transition | Semantic (BGE + pgvector) | 0.620 | 0.477 | 0.482 | 0.775 | 0.681 |
| Transition | Keyword baseline (TF-IDF) | 0.500 | 0.331 | 0.358 | 0.667 | 0.681 |
| Transition | Hybrid (BGE candidates + BM25, RRF) | 0.580 | 0.449 | 0.451 | 0.683 | 0.681 |
| All | Semantic (BGE + pgvector) | 0.827 | 0.476 | 0.567 | 0.898 | 0.569 |
| All | Keyword baseline (TF-IDF) | 0.773 | 0.410 | 0.510 | 0.849 | 0.569 |
| All | Hybrid (BGE candidates + BM25, RRF) | 0.809 | 0.463 | 0.552 | 0.856 | 0.569 |

R@5 cannot exceed the ceiling shown: with more than five relevant mentors, five results can only recover a fraction of them.

## Per query

| Set | Query | Relevant | Semantic P@5 | Semantic R@5 | Keyword P@5 | Keyword R@5 | Hybrid P@5 | Hybrid R@5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domain | I want to move from IT support into AWS cloud engineering and DevOps. | 9 | 1.00 | 0.56 | 1.00 | 0.56 | 1.00 | 0.56 |
| domain | How do I progress from first officer to captain as an airline pilot? | 15 | 1.00 | 0.33 | 1.00 | 0.33 | 1.00 | 0.33 |
| domain | I need guidance on a finance career: budgeting, forecasting and financial reporting. | 10 | 1.00 | 0.50 | 1.00 | 0.50 | 1.00 | 0.50 |
| domain | How can I use my cabin crew experience to move into hospitality and guest experience? | 13 | 1.00 | 0.38 | 1.00 | 0.38 | 1.00 | 0.38 |
| domain | I want a career in cargo, freight logistics and supply chain management. | 9 | 1.00 | 0.56 | 1.00 | 0.56 | 1.00 | 0.56 |
| domain | Advice on aircraft maintenance engineering, inspections and maintenance planning. | 7 | 1.00 | 0.71 | 1.00 | 0.71 | 1.00 | 0.71 |
| domain | Help me grow in human resources: recruitment, talent and people management. | 11 | 1.00 | 0.45 | 1.00 | 0.45 | 1.00 | 0.45 |
| domain | I am interested in aviation safety management, risk assessment and compliance audits. | 16 | 1.00 | 0.31 | 1.00 | 0.31 | 1.00 | 0.31 |
| domain | How do I lead airport ground handling and ramp operations teams? | 9 | 1.00 | 0.56 | 1.00 | 0.56 | 1.00 | 0.56 |
| domain | I want to work in sales, marketing and airline revenue management. | 10 | 1.00 | 0.50 | 1.00 | 0.50 | 1.00 | 0.50 |
| domain | Guidance on procurement, contract management and supplier negotiation. | 13 | 1.00 | 0.38 | 1.00 | 0.38 | 1.00 | 0.38 |
| domain | How can I improve customer service quality and complaint handling? | 11 | 1.00 | 0.45 | 1.00 | 0.45 | 1.00 | 0.45 |
| transition | I'm a pilot who wants to teach new pilots for a living. | 9 | 0.60 | 0.33 | 0.20 | 0.11 | 0.40 | 0.22 |
| transition | I want to leave aviation and work in a bank. | 13 | 0.00 | 0.00 | 0.60 | 0.23 | 0.00 | 0.00 |
| transition | How do I move from airline work into hotels and resorts? | 8 | 1.00 | 0.62 | 0.40 | 0.25 | 0.80 | 0.50 |
| transition | I'm interested in protecting systems from hackers at a fintech company. | 2 | 0.40 | 1.00 | 0.20 | 0.50 | 0.40 | 1.00 |
| transition | I would like to train and coach people as my main job. | 16 | 1.00 | 0.31 | 1.00 | 0.31 | 1.00 | 0.31 |
| transition | Can I become an independent consultant after my airline career? | 23 | 1.00 | 0.22 | 0.80 | 0.17 | 1.00 | 0.22 |
| transition | I want to join a mobile network operator. | 5 | 0.40 | 0.40 | 0.00 | 0.00 | 0.40 | 0.40 |
| transition | I want to build data pipelines and work on analytics. | 7 | 0.40 | 0.29 | 0.60 | 0.43 | 0.40 | 0.29 |
| transition | What is it like to run quality and maintenance in a factory? | 4 | 0.80 | 1.00 | 0.40 | 0.50 | 0.60 | 0.75 |
| transition | Careers in the energy sector, for example geothermal power. | 5 | 0.60 | 0.60 | 0.80 | 0.80 | 0.80 | 0.80 |

## Failure cases (semantic P@5 below 0.8)

- **I'm a pilot who wants to teach new pilots for a living.** returned 5 result(s); not relevant: alum-147 (Flight Operations), alum-050 (Flight Operations).
- **I want to leave aviation and work in a bank.** returned 5 result(s); not relevant: alum-175 (Finance), alum-187 (Finance), alum-127 (Finance), alum-159 (Flight Operations), alum-192 (Commercial).
- **I'm interested in protecting systems from hackers at a fintech company.** returned 5 result(s); not relevant: alum-078 (ICT / Digital), alum-174 (ICT / Digital), alum-186 (ICT / Digital).
- **I want to join a mobile network operator.** returned 5 result(s); not relevant: alum-017 (ICT / Digital), alum-031 (Commercial), alum-194 (Corporate Services).
- **I want to build data pipelines and work on analytics.** returned 5 result(s); not relevant: alum-078 (ICT / Digital), alum-174 (ICT / Digital), alum-017 (ICT / Digital).
- **Careers in the energy sector, for example geothermal power.** returned 5 result(s); not relevant: alum-098 (Corporate Services), alum-027 (Commercial).

## Ranking decision

The hybrid ranker keeps the semantic candidates (same similarity threshold) and re-orders them with BM25 keyword scores by reciprocal rank fusion (`services/matching/app/hybrid.py`). It would replace semantic ranking in the live service only if it matched or beat it on every macro metric in both query sets.

**Result: semantic ranking kept.** Keyword overlap favours mentors who share the member's words (often their old role) over mentors who match where the member wants to go, which lowers ranking quality on career-transition queries.


## Uncertainty (bootstrap 95% confidence intervals, all 22 queries)

| System | P@5 | R@5 | F1@5 | MRR@5 |
| --- | --- | --- | --- | --- |
| Semantic (BGE + pgvector) | 0.827 [0.700, 0.936] | 0.476 [0.384, 0.574] | 0.567 [0.483, 0.642] | 0.898 [0.773, 1.000] |
| Keyword (TF-IDF) | 0.773 [0.627, 0.900] | 0.410 [0.332, 0.485] | 0.510 [0.419, 0.595] | 0.849 [0.712, 0.955] |
| Hybrid (BGE + BM25, RRF) | 0.809 [0.682, 0.918] | 0.463 [0.374, 0.556] | 0.552 [0.469, 0.626] | 0.856 [0.727, 0.955] |

Queries resampled with replacement 10000 times (seed 20261117).

## Paired significance tests (Wilcoxon signed-rank, two-sided)

| Query set | Comparison | Metric | Non-zero pairs | A better / B better | Mean difference | p |
| --- | --- | --- | --- | --- | --- | --- |
| transition | semantic vs keyword_baseline | f1_at_5 | 9 of 10 | 6 / 3 | +0.125 | 0.2031 |
| transition | semantic vs keyword_baseline | reciprocal_rank | 5 of 10 | 3 / 2 | +0.108 | 0.625 |
| transition | semantic vs hybrid | f1_at_5 | 4 of 10 | 3 / 1 | +0.032 | 0.625 |
| transition | semantic vs hybrid | reciprocal_rank | 3 of 10 | 2 / 1 | +0.092 | 0.5 |
| transition | hybrid vs keyword_baseline | f1_at_5 | 8 of 10 | 6 / 2 | +0.093 | 0.3125 |
| transition | hybrid vs keyword_baseline | reciprocal_rank | 5 of 10 | 3 / 2 | +0.017 | 1.0 |
| all | semantic vs keyword_baseline | f1_at_5 | 9 of 22 | 6 / 3 | +0.057 | 0.1731 |
| all | semantic vs keyword_baseline | reciprocal_rank | 5 of 22 | 3 / 2 | +0.049 | 0.5002 |
| all | semantic vs hybrid | f1_at_5 | 4 of 22 | 3 / 1 | +0.015 | 0.4652 |
| all | semantic vs hybrid | reciprocal_rank | 3 of 22 | 2 / 1 | +0.042 | 0.2763 |
| all | hybrid vs keyword_baseline | f1_at_5 | 8 of 22 | 6 / 2 | +0.042 | 0.2626 |
| all | hybrid vs keyword_baseline | reciprocal_rank | 5 of 22 | 3 / 2 | +0.008 | 0.8923 |

With 22 queries the tests have little power; a p-value above 0.05 means no reliable difference was detected, not that the systems are equivalent.

## Similarity threshold sensitivity (semantic, analysis only)

| Threshold | P@5 | R@5 | F1@5 | MRR@5 | Mean results | Queries with < 5 results | Negative-control results |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.40 | 0.827 | 0.476 | 0.567 | 0.898 | 5.00 | 0 | 5 |
| 0.45 | 0.827 | 0.476 | 0.567 | 0.898 | 5.00 | 0 | 0 |
| 0.50 (production) | 0.827 | 0.476 | 0.567 | 0.898 | 5.00 | 0 | 0 |
| 0.55 | 0.718 | 0.386 | 0.477 | 0.864 | 3.95 | 6 | 0 |
| 0.60 | 0.518 | 0.249 | 0.331 | 0.591 | 2.59 | 12 | 0 |
| 0.65 | 0.209 | 0.097 | 0.130 | 0.318 | 1.05 | 19 | 0 |

P@5 divides by 5 even when fewer results clear the threshold, so a stricter threshold can lower P@5 while removing weak matches.


## Negative control

Off-topic query “Astrophysics research on black holes and galaxy formation.” returned 0 semantic result(s) (similarity threshold applied), 0 keyword result(s) and 0 hybrid result(s).

## Latency (ms)

| System | Timed calls | Mean | Median | p95 | Max |
| --- | --- | --- | --- | --- | --- |
| Semantic (BGE + pgvector) | 22 | 93.5 | 90.7 | 123.9 | 134.0 |
| Keyword (TF-IDF) | 22 | 1.6 | 1.6 | 1.8 | 2.6 |
| Hybrid (BGE + BM25, RRF) | 22 | 94.1 | 90.2 | 107.7 | 155.0 |

Semantic: HTTP round trip to the matching service (BGE query encoding + exact pgvector search), once per query plus 0 repeated round(s). Keyword: in-process TF-IDF scoring. Hybrid: semantic candidates (50) from the service plus in-process BM25 fusion. Same machine, sequential calls.

## Limitations

- Labels are derived from structured fields, not independent human judgement.
- Synthetic biographies follow templates, which can make semantic and keyword signals easier than real profiles.
- Results depend on the configured similarity threshold and current mentor availability.
