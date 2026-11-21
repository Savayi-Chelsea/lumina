# Semantic mentor matching evaluation

Evaluated 2026-11-17T14:43:41+00:00 · model `BAAI/bge-base-en-v1.5` · k = 5 · 325 eligible synthetic mentors (consenting, available, embedded) · similarity threshold 0.5 · MRR is MRR@5.

Relevance labels are rule-based and frozen in `evaluation/relevance_labels_expanded_500.json`. **Domain** queries name a former-department area (relevant: matching department or listed skill). **Transition** queries describe a career move; relevance comes from the mentor's current industry, organization, job title or skills, which the query usually does not name. All profiles are fictional, so these figures do not describe performance on real Kenya Airways alumni.

Query sets: **domain** (12) name a former-department area (relevant: matching department or listed skill); **skill** (6) ask for specific skills (relevant: mentor lists one of them); **transition** (15) describe a career move (relevant: where the mentor works now: industry, organization, title or skills); **leadership** (5) ask for leadership help (relevant: leadership skills or a senior title); **industry** (4) name a destination industry (relevant: mentor's current industry); **broad** (3) state a broad career need (relevant: a mentorship topic, title or skill that addresses it).

## Macro averages

| Query set | System | P@5 | R@5 | F1@5 | MRR | R@5 ceiling |
| --- | --- | --- | --- | --- | --- | --- |
| Domain | Semantic (BGE + pgvector) | 1.000 | 0.170 | 0.289 | 1.000 | 0.170 |
| Domain | Keyword baseline (TF-IDF) | 1.000 | 0.170 | 0.289 | 1.000 | 0.170 |
| Domain | Hybrid (BGE candidates + BM25, RRF) | 1.000 | 0.170 | 0.289 | 1.000 | 0.170 |
| Skill | Semantic (BGE + pgvector) | 0.833 | 0.346 | 0.472 | 1.000 | 0.428 |
| Skill | Keyword baseline (TF-IDF) | 1.000 | 0.428 | 0.580 | 1.000 | 0.428 |
| Skill | Hybrid (BGE candidates + BM25, RRF) | 1.000 | 0.428 | 0.580 | 1.000 | 0.428 |
| Transition | Semantic (BGE + pgvector) | 0.840 | 0.425 | 0.491 | 1.000 | 0.467 |
| Transition | Keyword baseline (TF-IDF) | 0.613 | 0.249 | 0.324 | 0.789 | 0.467 |
| Transition | Hybrid (BGE candidates + BM25, RRF) | 0.760 | 0.363 | 0.428 | 0.922 | 0.467 |
| Leadership | Semantic (BGE + pgvector) | 0.520 | 0.095 | 0.156 | 0.707 | 0.146 |
| Leadership | Keyword baseline (TF-IDF) | 0.880 | 0.133 | 0.224 | 1.000 | 0.146 |
| Leadership | Hybrid (BGE candidates + BM25, RRF) | 0.640 | 0.106 | 0.176 | 1.000 | 0.146 |
| Industry | Semantic (BGE + pgvector) | 0.900 | 0.706 | 0.783 | 1.000 | 0.806 |
| Industry | Keyword baseline (TF-IDF) | 1.000 | 0.806 | 0.883 | 1.000 | 0.806 |
| Industry | Hybrid (BGE candidates + BM25, RRF) | 0.950 | 0.756 | 0.833 | 1.000 | 0.806 |
| Broad | Semantic (BGE + pgvector) | 0.267 | 0.062 | 0.098 | 0.400 | 0.152 |
| Broad | Keyword baseline (TF-IDF) | 0.600 | 0.116 | 0.185 | 0.833 | 0.152 |
| Broad | Hybrid (BGE candidates + BM25, RRF) | 0.533 | 0.092 | 0.148 | 0.500 | 0.152 |
| All | Semantic (BGE + pgvector) | 0.813 | 0.310 | 0.397 | 0.927 | 0.356 |
| All | Keyword baseline (TF-IDF) | 0.831 | 0.279 | 0.378 | 0.918 | 0.356 |
| All | Hybrid (BGE candidates + BM25, RRF) | 0.844 | 0.309 | 0.401 | 0.941 | 0.356 |

R@5 cannot exceed the ceiling shown: with more than five relevant mentors, five results can only recover a fraction of them.

## Per query

| Set | Query | Relevant | Semantic P@5 | Semantic R@5 | Keyword P@5 | Keyword R@5 | Hybrid P@5 | Hybrid R@5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domain | I want to move from IT support into AWS cloud engineering and DevOps. | 27 | 1.00 | 0.19 | 1.00 | 0.19 | 1.00 | 0.19 |
| domain | How do I progress from first officer to captain as an airline pilot? | 26 | 1.00 | 0.19 | 1.00 | 0.19 | 1.00 | 0.19 |
| domain | I need guidance on a finance career: budgeting, forecasting and financial reporting. | 33 | 1.00 | 0.15 | 1.00 | 0.15 | 1.00 | 0.15 |
| domain | How can I use my cabin crew experience to move into hospitality and guest experience? | 31 | 1.00 | 0.16 | 1.00 | 0.16 | 1.00 | 0.16 |
| domain | I want a career in cargo, freight logistics and supply chain management. | 30 | 1.00 | 0.17 | 1.00 | 0.17 | 1.00 | 0.17 |
| domain | Advice on aircraft maintenance engineering, inspections and maintenance planning. | 23 | 1.00 | 0.22 | 1.00 | 0.22 | 1.00 | 0.22 |
| domain | Help me grow in human resources: recruitment, talent and people management. | 28 | 1.00 | 0.18 | 1.00 | 0.18 | 1.00 | 0.18 |
| domain | I am interested in aviation safety management, risk assessment and compliance audits. | 38 | 1.00 | 0.13 | 1.00 | 0.13 | 1.00 | 0.13 |
| domain | How do I lead airport ground handling and ramp operations teams? | 25 | 1.00 | 0.20 | 1.00 | 0.20 | 1.00 | 0.20 |
| domain | I want to work in sales, marketing and airline revenue management. | 38 | 1.00 | 0.13 | 1.00 | 0.13 | 1.00 | 0.13 |
| domain | Guidance on procurement, contract management and supplier negotiation. | 34 | 1.00 | 0.15 | 1.00 | 0.15 | 1.00 | 0.15 |
| domain | How can I improve customer service quality and complaint handling? | 29 | 1.00 | 0.17 | 1.00 | 0.17 | 1.00 | 0.17 |
| skill | I need a mentor who has run Kubernetes and Terraform in production. | 9 | 0.60 | 0.33 | 1.00 | 0.56 | 1.00 | 0.56 |
| skill | Who can help me master IFRS financial reporting? | 24 | 1.00 | 0.21 | 1.00 | 0.21 | 1.00 | 0.21 |
| skill | I want to get better at SQL and building Power BI dashboards. | 7 | 0.80 | 0.57 | 1.00 | 0.71 | 1.00 | 0.71 |
| skill | Looking for guidance on ISO 9001 quality management audits. | 18 | 0.80 | 0.22 | 1.00 | 0.28 | 1.00 | 0.28 |
| skill | I want to learn revenue management and pricing strategy. | 14 | 0.80 | 0.29 | 1.00 | 0.36 | 1.00 | 0.36 |
| skill | Help with customs clearance, dangerous goods and freight forwarding. | 11 | 1.00 | 0.45 | 1.00 | 0.45 | 1.00 | 0.45 |
| transition | I'm a pilot who wants to teach new pilots for a living. | 10 | 0.60 | 0.30 | 0.40 | 0.20 | 0.60 | 0.30 |
| transition | I want to leave aviation and work in a bank. | 17 | 0.80 | 0.24 | 0.20 | 0.06 | 0.60 | 0.18 |
| transition | How do I move from airline work into hotels and resorts? | 21 | 1.00 | 0.24 | 1.00 | 0.24 | 1.00 | 0.24 |
| transition | I'm interested in protecting systems from hackers at a fintech company. | 11 | 0.60 | 0.27 | 0.40 | 0.18 | 0.60 | 0.27 |
| transition | I would like to train and coach people as my main job. | 34 | 1.00 | 0.15 | 1.00 | 0.15 | 1.00 | 0.15 |
| transition | Can I become an independent consultant after my airline career? | 43 | 0.80 | 0.09 | 0.80 | 0.09 | 1.00 | 0.12 |
| transition | I want to join a mobile network operator. | 22 | 0.80 | 0.18 | 0.00 | 0.00 | 0.20 | 0.05 |
| transition | I want to build data pipelines and work on analytics. | 19 | 1.00 | 0.26 | 1.00 | 0.26 | 1.00 | 0.26 |
| transition | What is it like to run quality and maintenance in a factory? | 9 | 1.00 | 0.56 | 0.60 | 0.33 | 1.00 | 0.56 |
| transition | Careers in the energy sector, for example geothermal power. | 17 | 1.00 | 0.29 | 1.00 | 0.29 | 1.00 | 0.29 |
| transition | I'm a flight attendant who wants to become a software developer. | 8 | 0.80 | 0.50 | 0.60 | 0.38 | 0.80 | 0.50 |
| transition | I want to move from aircraft engineering into renewable energy. | 17 | 1.00 | 0.29 | 1.00 | 0.29 | 1.00 | 0.29 |
| transition | How do I become a product manager at a fintech or tech company? | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| transition | I'd like to work for an NGO on development programmes. | 2 | 0.40 | 1.00 | 0.00 | 0.00 | 0.40 | 1.00 |
| transition | Can airline operations experience transfer to running a hospital? | 4 | 0.80 | 1.00 | 0.20 | 0.25 | 0.20 | 0.25 |
| leadership | I've just been promoted and will manage a team for the first time. | 67 | 0.20 | 0.01 | 1.00 | 0.07 | 0.60 | 0.04 |
| leadership | How do I prepare for a director or executive role? | 36 | 0.60 | 0.08 | 0.80 | 0.11 | 0.60 | 0.08 |
| leadership | I need advice on leading organisational change and transformation. | 39 | 0.20 | 0.03 | 1.00 | 0.13 | 0.40 | 0.05 |
| leadership | Help me think strategically and present plans to senior stakeholders. | 52 | 0.60 | 0.06 | 0.60 | 0.06 | 0.60 | 0.06 |
| leadership | How do I lead large shift-based operations teams at an airport? | 17 | 1.00 | 0.29 | 1.00 | 0.29 | 1.00 | 0.29 |
| industry | I want to move into tourism and safari travel. | 5 | 0.60 | 0.60 | 1.00 | 1.00 | 0.80 | 0.80 |
| industry | What are careers like in government and public policy? | 9 | 1.00 | 0.56 | 1.00 | 0.56 | 1.00 | 0.56 |
| industry | I'd like to work in agriculture or agribusiness exports. | 6 | 1.00 | 0.83 | 1.00 | 0.83 | 1.00 | 0.83 |
| industry | Is real estate a good next step after the airline? | 6 | 1.00 | 0.83 | 1.00 | 0.83 | 1.00 | 0.83 |
| broad | I left the airline recently and I'm not sure what to do next. | 96 | 0.20 | 0.01 | 0.60 | 0.03 | 0.80 | 0.04 |
| broad | I want to start my own business. | 17 | 0.60 | 0.18 | 1.00 | 0.29 | 0.80 | 0.24 |
| broad | Help me rewrite my CV and prepare for interviews outside aviation. | 45 | 0.00 | 0.00 | 0.20 | 0.02 | 0.00 | 0.00 |

## Failure cases (semantic P@5 below 0.8)

- **I need a mentor who has run Kubernetes and Terraform in production.** returned 5 result(s); not relevant: alum-017 (ICT / Digital), alum-323 (ICT / Digital).
- **I'm a pilot who wants to teach new pilots for a living.** returned 5 result(s); not relevant: alum-223 (Flight Operations), alum-485 (Flight Operations).
- **I'm interested in protecting systems from hackers at a fintech company.** returned 5 result(s); not relevant: alum-078 (ICT / Digital), alum-174 (ICT / Digital).
- **I'd like to work for an NGO on development programmes.** returned 5 result(s); not relevant: alum-386 (Corporate Services), alum-489 (Flight Operations), alum-426 (Commercial).
- **I've just been promoted and will manage a team for the first time.** returned 5 result(s); not relevant: alum-084 (Commercial), alum-060 (Commercial), alum-319 (Commercial), alum-463 (Human Resources).
- **How do I prepare for a director or executive role?** returned 5 result(s); not relevant: alum-297 (Flight Operations), alum-215 (Commercial).
- **I need advice on leading organisational change and transformation.** returned 5 result(s); not relevant: alum-245 (Finance), alum-297 (Flight Operations), alum-318 (Human Resources), alum-176 (Human Resources).
- **Help me think strategically and present plans to senior stakeholders.** returned 5 result(s); not relevant: alum-117 (Ground Operations), alum-249 (Commercial).
- **I want to move into tourism and safari travel.** returned 5 result(s); not relevant: alum-341 (Commercial), alum-325 (Customer Experience).
- **I left the airline recently and I'm not sure what to do next.** returned 5 result(s); not relevant: alum-248 (Cabin Services), alum-171 (Flight Operations), alum-296 (Cabin Services), alum-147 (Flight Operations).
- **I want to start my own business.** returned 5 result(s); not relevant: alum-084 (Commercial), alum-060 (Commercial).
- **Help me rewrite my CV and prepare for interviews outside aviation.** returned 5 result(s); not relevant: alum-087 (Flight Operations), alum-123 (Flight Operations), alum-159 (Flight Operations), alum-099 (Flight Operations), alum-075 (Flight Operations).

## Ranking decision

The hybrid ranker keeps the semantic candidates (same similarity threshold) and re-orders them with BM25 keyword scores by reciprocal rank fusion (`services/matching/app/hybrid.py`). It would replace semantic ranking in the live service only if it matched or beat it on every macro metric in both query sets.

**Result: semantic ranking kept.** Keyword overlap favours mentors who share the member's words (often their old role) over mentors who match where the member wants to go, which lowers ranking quality on career-transition queries.


## Uncertainty (bootstrap 95% confidence intervals, all 22 queries)

| System | P@5 | R@5 | F1@5 | MRR@5 |
| --- | --- | --- | --- | --- |
| Semantic (BGE + pgvector) | 0.813 [0.733, 0.889] | 0.310 [0.237, 0.392] | 0.397 [0.329, 0.469] | 0.927 [0.852, 0.985] |
| Keyword (TF-IDF) | 0.831 [0.738, 0.911] | 0.279 [0.210, 0.355] | 0.378 [0.306, 0.455] | 0.918 [0.841, 0.978] |
| Hybrid (BGE + BM25, RRF) | 0.844 [0.764, 0.916] | 0.309 [0.237, 0.388] | 0.401 [0.332, 0.474] | 0.941 [0.874, 0.989] |

Queries resampled with replacement 10000 times (seed 20261117).

## Paired significance tests (Wilcoxon signed-rank, two-sided)

| Query set | Comparison | Metric | Non-zero pairs | A better / B better | Mean difference | p |
| --- | --- | --- | --- | --- | --- | --- |
| skill | semantic vs keyword_baseline | f1_at_5 | 4 of 6 | 0 / 4 | -0.107 | 0.125 |
| skill | semantic vs keyword_baseline | reciprocal_rank | 0 of 6 | 0 / 0 | +0.000 | n/a |
| skill | semantic vs hybrid | f1_at_5 | 4 of 6 | 0 / 4 | -0.107 | 0.125 |
| skill | semantic vs hybrid | reciprocal_rank | 0 of 6 | 0 / 0 | +0.000 | n/a |
| skill | hybrid vs keyword_baseline | f1_at_5 | 0 of 6 | 0 / 0 | +0.000 | n/a |
| skill | hybrid vs keyword_baseline | reciprocal_rank | 0 of 6 | 0 / 0 | +0.000 | n/a |
| transition | semantic vs keyword_baseline | f1_at_5 | 8 of 15 | 8 / 0 | +0.167 | 0.0117 |
| transition | semantic vs keyword_baseline | reciprocal_rank | 4 of 15 | 4 / 0 | +0.211 | 0.0656 |
| transition | semantic vs hybrid | f1_at_5 | 4 of 15 | 3 / 1 | +0.062 | 0.1441 |
| transition | semantic vs hybrid | reciprocal_rank | 2 of 15 | 2 / 0 | +0.078 | 0.1797 |
| transition | hybrid vs keyword_baseline | f1_at_5 | 8 of 15 | 8 / 0 | +0.104 | 0.0117 |
| transition | hybrid vs keyword_baseline | reciprocal_rank | 5 of 15 | 4 / 1 | +0.133 | 0.2763 |
| leadership | semantic vs keyword_baseline | f1_at_5 | 3 of 5 | 0 / 3 | -0.068 | 0.25 |
| leadership | semantic vs keyword_baseline | reciprocal_rank | 2 of 5 | 0 / 2 | -0.293 | 0.5 |
| leadership | semantic vs hybrid | f1_at_5 | 2 of 5 | 0 / 2 | -0.020 | 0.5 |
| leadership | semantic vs hybrid | reciprocal_rank | 2 of 5 | 0 / 2 | -0.293 | 0.5 |
| leadership | hybrid vs keyword_baseline | f1_at_5 | 3 of 5 | 0 / 3 | -0.048 | 0.25 |
| leadership | hybrid vs keyword_baseline | reciprocal_rank | 0 of 5 | 0 / 0 | +0.000 | n/a |
| all | semantic vs keyword_baseline | f1_at_5 | 19 of 45 | 8 / 11 | +0.019 | 0.7022 |
| all | semantic vs keyword_baseline | reciprocal_rank | 8 of 45 | 4 / 4 | +0.009 | 0.7784 |
| all | semantic vs hybrid | f1_at_5 | 13 of 45 | 3 / 10 | -0.004 | 0.2944 |
| all | semantic vs hybrid | reciprocal_rank | 5 of 45 | 2 / 3 | -0.013 | 0.5879 |
| all | hybrid vs keyword_baseline | f1_at_5 | 15 of 45 | 9 / 6 | +0.023 | 0.2805 |
| all | hybrid vs keyword_baseline | reciprocal_rank | 7 of 45 | 4 / 3 | +0.022 | 0.5461 |

With 22 queries the tests have little power; a p-value above 0.05 means no reliable difference was detected, not that the systems are equivalent.

## Similarity threshold sensitivity (semantic, analysis only)

| Threshold | P@5 | R@5 | F1@5 | MRR@5 | Mean results | Queries with < 5 results | Negative-control results |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.40 | 0.813 | 0.310 | 0.397 | 0.927 | 5.00 | 0 | 5 |
| 0.45 | 0.813 | 0.310 | 0.397 | 0.927 | 5.00 | 0 | 0 |
| 0.50 (production) | 0.813 | 0.310 | 0.397 | 0.927 | 5.00 | 0 | 0 |
| 0.55 | 0.733 | 0.287 | 0.363 | 0.883 | 4.38 | 9 | 0 |
| 0.60 | 0.427 | 0.168 | 0.206 | 0.582 | 2.40 | 28 | 0 |
| 0.65 | 0.138 | 0.037 | 0.052 | 0.244 | 0.69 | 41 | 0 |

P@5 divides by 5 even when fewer results clear the threshold, so a stricter threshold can lower P@5 while removing weak matches.


## Negative control

Off-topic query “Astrophysics research on black holes and galaxy formation.” returned 0 semantic result(s) (similarity threshold applied), 5 keyword result(s) and 0 hybrid result(s).

## Latency (ms)

| System | Timed calls | Mean | Median | p95 | Max |
| --- | --- | --- | --- | --- | --- |
| Semantic (BGE + pgvector) | 45 | 90.5 | 89.3 | 107.1 | 110.6 |
| Keyword (TF-IDF) | 45 | 2.0 | 1.9 | 2.5 | 4.3 |
| Hybrid (BGE + BM25, RRF) | 45 | 95.7 | 92.5 | 110.8 | 140.2 |
| Semantic, repeated rounds over all labelled queries | 225 | 92.3 | 91.0 | 111.2 | 130.6 |

Semantic: HTTP round trip to the matching service (BGE query encoding + exact pgvector search), once per query plus 5 repeated round(s). Keyword: in-process TF-IDF scoring. Hybrid: semantic candidates (50) from the service plus in-process BM25 fusion. Same machine, sequential calls.

## Limitations

- Labels are derived from structured fields, not independent human judgement.
- Synthetic biographies follow templates, which can make semantic and keyword signals easier than real profiles.
- Results depend on the configured similarity threshold and current mentor availability.
