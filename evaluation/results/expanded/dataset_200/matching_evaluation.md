# Semantic mentor matching evaluation

Evaluated 2026-11-17T14:42:53+00:00 · model `BAAI/bge-base-en-v1.5` · k = 5 · 133 eligible synthetic mentors (consenting, available, embedded) · similarity threshold 0.5 · MRR is MRR@5.

Relevance labels are rule-based and frozen in `evaluation/relevance_labels_expanded_200.json`. **Domain** queries name a former-department area (relevant: matching department or listed skill). **Transition** queries describe a career move; relevance comes from the mentor's current industry, organization, job title or skills, which the query usually does not name. All profiles are fictional, so these figures do not describe performance on real Kenya Airways alumni.

Query sets: **domain** (12) name a former-department area (relevant: matching department or listed skill); **skill** (6) ask for specific skills (relevant: mentor lists one of them); **transition** (11) describe a career move (relevant: where the mentor works now: industry, organization, title or skills); **leadership** (3) ask for leadership help (relevant: leadership skills or a senior title); **broad** (1) state a broad career need (relevant: a mentorship topic, title or skill that addresses it).

## Macro averages

| Query set | System | P@5 | R@5 | F1@5 | MRR | R@5 ceiling |
| --- | --- | --- | --- | --- | --- | --- |
| Domain | Semantic (BGE + pgvector) | 1.000 | 0.475 | 0.637 | 1.000 | 0.475 |
| Domain | Keyword baseline (TF-IDF) | 1.000 | 0.475 | 0.637 | 1.000 | 0.475 |
| Domain | Hybrid (BGE candidates + BM25, RRF) | 1.000 | 0.475 | 0.637 | 1.000 | 0.475 |
| Skill | Semantic (BGE + pgvector) | 0.733 | 0.571 | 0.626 | 1.000 | 0.799 |
| Skill | Keyword baseline (TF-IDF) | 0.933 | 0.799 | 0.834 | 1.000 | 0.799 |
| Skill | Hybrid (BGE candidates + BM25, RRF) | 0.800 | 0.632 | 0.690 | 1.000 | 0.799 |
| Transition | Semantic (BGE + pgvector) | 0.564 | 0.434 | 0.439 | 0.705 | 0.710 |
| Transition | Keyword baseline (TF-IDF) | 0.455 | 0.301 | 0.325 | 0.606 | 0.710 |
| Transition | Hybrid (BGE candidates + BM25, RRF) | 0.527 | 0.408 | 0.410 | 0.621 | 0.710 |
| Leadership | Semantic (BGE + pgvector) | 0.400 | 0.250 | 0.296 | 0.417 | 0.833 |
| Leadership | Keyword baseline (TF-IDF) | 0.733 | 0.722 | 0.685 | 1.000 | 0.833 |
| Leadership | Hybrid (BGE candidates + BM25, RRF) | 0.600 | 0.528 | 0.528 | 0.733 | 0.833 |
| Broad | Semantic (BGE + pgvector) | 0.000 | 0.000 | 0.000 | 0.000 | 0.833 |
| Broad | Keyword baseline (TF-IDF) | 0.000 | 0.000 | 0.000 | 0.000 | 0.833 |
| Broad | Hybrid (BGE candidates + BM25, RRF) | 0.000 | 0.000 | 0.000 | 0.000 | 0.833 |
| All | Semantic (BGE + pgvector) | 0.721 | 0.444 | 0.519 | 0.818 | 0.656 |
| All | Keyword baseline (TF-IDF) | 0.751 | 0.484 | 0.554 | 0.838 | 0.656 |
| All | Hybrid (BGE candidates + BM25, RRF) | 0.739 | 0.472 | 0.542 | 0.819 | 0.656 |

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
| skill | I need a mentor who has run Kubernetes and Terraform in production. | 5 | 0.80 | 0.80 | 1.00 | 1.00 | 1.00 | 1.00 |
| skill | Who can help me master IFRS financial reporting? | 10 | 1.00 | 0.50 | 1.00 | 0.50 | 1.00 | 0.50 |
| skill | I want to get better at SQL and building Power BI dashboards. | 3 | 0.20 | 0.33 | 0.60 | 1.00 | 0.20 | 0.33 |
| skill | Looking for guidance on ISO 9001 quality management audits. | 6 | 0.60 | 0.50 | 1.00 | 0.83 | 0.80 | 0.67 |
| skill | I want to learn revenue management and pricing strategy. | 6 | 0.80 | 0.67 | 1.00 | 0.83 | 0.80 | 0.67 |
| skill | Help with customs clearance, dangerous goods and freight forwarding. | 8 | 1.00 | 0.62 | 1.00 | 0.62 | 1.00 | 0.62 |
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
| transition | I want to move from aircraft engineering into renewable energy. | 5 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| leadership | I've just been promoted and will manage a team for the first time. | 3 | 0.00 | 0.00 | 0.40 | 0.67 | 0.20 | 0.33 |
| leadership | I need advice on leading organisational change and transformation. | 4 | 0.20 | 0.25 | 0.80 | 1.00 | 0.60 | 0.75 |
| leadership | How do I lead large shift-based operations teams at an airport? | 10 | 1.00 | 0.50 | 1.00 | 0.50 | 1.00 | 0.50 |
| broad | Help me rewrite my CV and prepare for interviews outside aviation. | 6 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## Failure cases (semantic P@5 below 0.8)

- **I want to get better at SQL and building Power BI dashboards.** returned 2 result(s); not relevant: alum-176 (Human Resources).
- **Looking for guidance on ISO 9001 quality management audits.** returned 5 result(s); not relevant: alum-061 (Safety & Quality), alum-025 (Safety & Quality).
- **I'm a pilot who wants to teach new pilots for a living.** returned 5 result(s); not relevant: alum-147 (Flight Operations), alum-050 (Flight Operations).
- **I want to leave aviation and work in a bank.** returned 5 result(s); not relevant: alum-175 (Finance), alum-187 (Finance), alum-127 (Finance), alum-159 (Flight Operations), alum-192 (Commercial).
- **I'm interested in protecting systems from hackers at a fintech company.** returned 5 result(s); not relevant: alum-078 (ICT / Digital), alum-174 (ICT / Digital), alum-186 (ICT / Digital).
- **I want to join a mobile network operator.** returned 5 result(s); not relevant: alum-017 (ICT / Digital), alum-031 (Commercial), alum-194 (Corporate Services).
- **I want to build data pipelines and work on analytics.** returned 5 result(s); not relevant: alum-078 (ICT / Digital), alum-174 (ICT / Digital), alum-017 (ICT / Digital).
- **Careers in the energy sector, for example geothermal power.** returned 5 result(s); not relevant: alum-098 (Corporate Services), alum-027 (Commercial).
- **I want to move from aircraft engineering into renewable energy.** returned 5 result(s); not relevant: alum-185 (Engineering & Maintenance), alum-159 (Flight Operations), alum-101 (Engineering & Maintenance), alum-137 (Engineering & Maintenance), alum-173 (Engineering & Maintenance).
- **I've just been promoted and will manage a team for the first time.** returned 5 result(s); not relevant: alum-084 (Commercial), alum-060 (Commercial), alum-116 (Human Resources), alum-072 (Commercial), alum-192 (Commercial).
- **I need advice on leading organisational change and transformation.** returned 5 result(s); not relevant: alum-176 (Human Resources), alum-117 (Ground Operations), alum-152 (Human Resources), alum-083 (Customer Experience).
- **Help me rewrite my CV and prepare for interviews outside aviation.** returned 5 result(s); not relevant: alum-087 (Flight Operations), alum-123 (Flight Operations), alum-159 (Flight Operations), alum-099 (Flight Operations), alum-075 (Flight Operations).

## Ranking decision

The hybrid ranker keeps the semantic candidates (same similarity threshold) and re-orders them with BM25 keyword scores by reciprocal rank fusion (`services/matching/app/hybrid.py`). It would replace semantic ranking in the live service only if it matched or beat it on every macro metric in both query sets.

**Result: semantic ranking kept.** Keyword overlap favours mentors who share the member's words (often their old role) over mentors who match where the member wants to go, which lowers ranking quality on career-transition queries.


## Uncertainty (bootstrap 95% confidence intervals, all 22 queries)

| System | P@5 | R@5 | F1@5 | MRR@5 |
| --- | --- | --- | --- | --- |
| Semantic (BGE + pgvector) | 0.721 [0.594, 0.836] | 0.444 [0.360, 0.529] | 0.519 [0.432, 0.600] | 0.818 [0.682, 0.932] |
| Keyword (TF-IDF) | 0.751 [0.630, 0.861] | 0.484 [0.391, 0.574] | 0.554 [0.462, 0.638] | 0.838 [0.717, 0.939] |
| Hybrid (BGE + BM25, RRF) | 0.739 [0.618, 0.849] | 0.472 [0.389, 0.554] | 0.542 [0.457, 0.620] | 0.819 [0.696, 0.924] |

Queries resampled with replacement 10000 times (seed 20261117).

## Paired significance tests (Wilcoxon signed-rank, two-sided)

| Query set | Comparison | Metric | Non-zero pairs | A better / B better | Mean difference | p |
| --- | --- | --- | --- | --- | --- | --- |
| skill | semantic vs keyword_baseline | f1_at_5 | 4 of 6 | 0 / 4 | -0.208 | 0.125 |
| skill | semantic vs keyword_baseline | reciprocal_rank | 0 of 6 | 0 / 0 | +0.000 | n/a |
| skill | semantic vs hybrid | f1_at_5 | 2 of 6 | 0 / 2 | -0.064 | 0.5 |
| skill | semantic vs hybrid | reciprocal_rank | 0 of 6 | 0 / 0 | +0.000 | n/a |
| skill | hybrid vs keyword_baseline | f1_at_5 | 3 of 6 | 0 / 3 | -0.144 | 0.25 |
| skill | hybrid vs keyword_baseline | reciprocal_rank | 0 of 6 | 0 / 0 | +0.000 | n/a |
| transition | semantic vs keyword_baseline | f1_at_5 | 9 of 11 | 6 / 3 | +0.114 | 0.2031 |
| transition | semantic vs keyword_baseline | reciprocal_rank | 5 of 11 | 3 / 2 | +0.099 | 0.625 |
| transition | semantic vs hybrid | f1_at_5 | 4 of 11 | 3 / 1 | +0.029 | 0.625 |
| transition | semantic vs hybrid | reciprocal_rank | 3 of 11 | 2 / 1 | +0.083 | 0.5 |
| transition | hybrid vs keyword_baseline | f1_at_5 | 8 of 11 | 6 / 2 | +0.085 | 0.3125 |
| transition | hybrid vs keyword_baseline | reciprocal_rank | 5 of 11 | 3 / 2 | +0.015 | 1.0 |
| all | semantic vs keyword_baseline | f1_at_5 | 15 of 33 | 6 / 9 | -0.035 | 0.4603 |
| all | semantic vs keyword_baseline | reciprocal_rank | 7 of 33 | 3 / 4 | -0.020 | 0.6715 |
| all | semantic vs hybrid | f1_at_5 | 8 of 33 | 3 / 5 | -0.023 | 0.2076 |
| all | semantic vs hybrid | reciprocal_rank | 5 of 33 | 2 / 3 | -0.001 | 0.8923 |
| all | hybrid vs keyword_baseline | f1_at_5 | 13 of 33 | 6 / 7 | -0.012 | 0.7006 |
| all | hybrid vs keyword_baseline | reciprocal_rank | 6 of 33 | 3 / 3 | -0.019 | 0.5992 |

With 22 queries the tests have little power; a p-value above 0.05 means no reliable difference was detected, not that the systems are equivalent.

## Similarity threshold sensitivity (semantic, analysis only)

| Threshold | P@5 | R@5 | F1@5 | MRR@5 | Mean results | Queries with < 5 results | Negative-control results |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.40 | 0.727 | 0.454 | 0.526 | 0.818 | 5.00 | 0 | 5 |
| 0.45 | 0.727 | 0.454 | 0.526 | 0.818 | 5.00 | 0 | 0 |
| 0.50 (production) | 0.721 | 0.444 | 0.519 | 0.818 | 4.91 | 1 | 0 |
| 0.55 | 0.606 | 0.341 | 0.417 | 0.758 | 3.76 | 11 | 0 |
| 0.60 | 0.358 | 0.174 | 0.230 | 0.455 | 1.94 | 22 | 0 |
| 0.65 | 0.139 | 0.064 | 0.086 | 0.212 | 0.70 | 30 | 0 |

P@5 divides by 5 even when fewer results clear the threshold, so a stricter threshold can lower P@5 while removing weak matches.


## Negative control

Off-topic query “Astrophysics research on black holes and galaxy formation.” returned 0 semantic result(s) (similarity threshold applied), 0 keyword result(s) and 0 hybrid result(s).

## Latency (ms)

| System | Timed calls | Mean | Median | p95 | Max |
| --- | --- | --- | --- | --- | --- |
| Semantic (BGE + pgvector) | 33 | 93.3 | 88.8 | 125.5 | 133.6 |
| Keyword (TF-IDF) | 33 | 1.6 | 1.6 | 2.0 | 2.0 |
| Hybrid (BGE + BM25, RRF) | 33 | 91.9 | 90.4 | 108.1 | 112.8 |
| Semantic, repeated rounds over all labelled queries | 225 | 91.0 | 88.5 | 110.0 | 139.4 |

Semantic: HTTP round trip to the matching service (BGE query encoding + exact pgvector search), once per query plus 5 repeated round(s). Keyword: in-process TF-IDF scoring. Hybrid: semantic candidates (50) from the service plus in-process BM25 fusion. Same machine, sequential calls.

## Queries without any relevant mentor in this corpus (not scored)

- t-developer (transition): I'm a flight attendant who wants to become a software developer.
- t-product (transition): How do I become a product manager at a fintech or tech company?
- t-ngo (transition): I'd like to work for an NGO on development programmes.
- t-healthcare (transition): Can airline operations experience transfer to running a hospital?
- l-executive (leadership): How do I prepare for a director or executive role?
- l-strategy (leadership): Help me think strategically and present plans to senior stakeholders.
- i-tourism (industry): I want to move into tourism and safari travel.
- i-government (industry): What are careers like in government and public policy?
- i-agriculture (industry): I'd like to work in agriculture or agribusiness exports.
- i-real-estate (industry): Is real estate a good next step after the airline?
- b-next-step (broad): I left the airline recently and I'm not sure what to do next.
- b-business (broad): I want to start my own business.

## Limitations

- Labels are derived from structured fields, not independent human judgement.
- Synthetic biographies follow templates, which can make semantic and keyword signals easier than real profiles.
- Results depend on the configured similarity threshold and current mentor availability.
