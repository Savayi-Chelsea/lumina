# Semantic mentor matching evaluation

Evaluated 2026-10-18T22:56:12+00:00 · model `BAAI/bge-base-en-v1.5` · k = 5 · 133 eligible synthetic mentors (consenting, available, embedded).

Relevance labels are rule-based and frozen in `evaluation/relevance_labels.json`. **Domain** queries name a former-department area (relevant: matching department or listed skill). **Transition** queries describe a career move; relevance comes from the mentor's current industry, organization, job title or skills, which the query usually does not name. All profiles are fictional, so these figures do not describe performance on real Kenya Airways alumni.

## Macro averages

| Query set | System | P@5 | R@5 | F1@5 | MRR | R@5 ceiling |
| --- | --- | --- | --- | --- | --- | --- |
| Domain | Semantic (BGE + pgvector) | 1.000 | 0.475 | 0.637 | 1.000 | 0.475 |
| Domain | Keyword baseline (TF-IDF) | 1.000 | 0.475 | 0.637 | 1.000 | 0.475 |
| Transition | Semantic (BGE + pgvector) | 0.620 | 0.477 | 0.482 | 0.775 | 0.681 |
| Transition | Keyword baseline (TF-IDF) | 0.500 | 0.331 | 0.358 | 0.667 | 0.681 |
| All | Semantic (BGE + pgvector) | 0.827 | 0.476 | 0.567 | 0.898 | 0.569 |
| All | Keyword baseline (TF-IDF) | 0.773 | 0.410 | 0.510 | 0.849 | 0.569 |

R@5 cannot exceed the ceiling shown: with more than five relevant mentors, five results can only recover a fraction of them.

## Per query

| Set | Query | Relevant | Semantic P@5 | Semantic R@5 | Keyword P@5 | Keyword R@5 |
| --- | --- | --- | --- | --- | --- | --- |
| domain | I want to move from IT support into AWS cloud engineering and DevOps. | 9 | 1.00 | 0.56 | 1.00 | 0.56 |
| domain | How do I progress from first officer to captain as an airline pilot? | 15 | 1.00 | 0.33 | 1.00 | 0.33 |
| domain | I need guidance on a finance career: budgeting, forecasting and financial reporting. | 10 | 1.00 | 0.50 | 1.00 | 0.50 |
| domain | How can I use my cabin crew experience to move into hospitality and guest experience? | 13 | 1.00 | 0.38 | 1.00 | 0.38 |
| domain | I want a career in cargo, freight logistics and supply chain management. | 9 | 1.00 | 0.56 | 1.00 | 0.56 |
| domain | Advice on aircraft maintenance engineering, inspections and maintenance planning. | 7 | 1.00 | 0.71 | 1.00 | 0.71 |
| domain | Help me grow in human resources: recruitment, talent and people management. | 11 | 1.00 | 0.45 | 1.00 | 0.45 |
| domain | I am interested in aviation safety management, risk assessment and compliance audits. | 16 | 1.00 | 0.31 | 1.00 | 0.31 |
| domain | How do I lead airport ground handling and ramp operations teams? | 9 | 1.00 | 0.56 | 1.00 | 0.56 |
| domain | I want to work in sales, marketing and airline revenue management. | 10 | 1.00 | 0.50 | 1.00 | 0.50 |
| domain | Guidance on procurement, contract management and supplier negotiation. | 13 | 1.00 | 0.38 | 1.00 | 0.38 |
| domain | How can I improve customer service quality and complaint handling? | 11 | 1.00 | 0.45 | 1.00 | 0.45 |
| transition | I'm a pilot who wants to teach new pilots for a living. | 9 | 0.60 | 0.33 | 0.20 | 0.11 |
| transition | I want to leave aviation and work in a bank. | 13 | 0.00 | 0.00 | 0.60 | 0.23 |
| transition | How do I move from airline work into hotels and resorts? | 8 | 1.00 | 0.62 | 0.40 | 0.25 |
| transition | I'm interested in protecting systems from hackers at a fintech company. | 2 | 0.40 | 1.00 | 0.20 | 0.50 |
| transition | I would like to train and coach people as my main job. | 16 | 1.00 | 0.31 | 1.00 | 0.31 |
| transition | Can I become an independent consultant after my airline career? | 23 | 1.00 | 0.22 | 0.80 | 0.17 |
| transition | I want to join a mobile network operator. | 5 | 0.40 | 0.40 | 0.00 | 0.00 |
| transition | I want to build data pipelines and work on analytics. | 7 | 0.40 | 0.29 | 0.60 | 0.43 |
| transition | What is it like to run quality and maintenance in a factory? | 4 | 0.80 | 1.00 | 0.40 | 0.50 |
| transition | Careers in the energy sector, for example geothermal power. | 5 | 0.60 | 0.60 | 0.80 | 0.80 |

## Failure cases (semantic P@5 below 0.8)

- **I'm a pilot who wants to teach new pilots for a living.** returned 5 result(s); not relevant: alum-147 (Flight Operations), alum-050 (Flight Operations).
- **I want to leave aviation and work in a bank.** returned 5 result(s); not relevant: alum-175 (Finance), alum-187 (Finance), alum-127 (Finance), alum-159 (Flight Operations), alum-192 (Commercial).
- **I'm interested in protecting systems from hackers at a fintech company.** returned 5 result(s); not relevant: alum-078 (ICT / Digital), alum-174 (ICT / Digital), alum-186 (ICT / Digital).
- **I want to join a mobile network operator.** returned 5 result(s); not relevant: alum-017 (ICT / Digital), alum-031 (Commercial), alum-194 (Corporate Services).
- **I want to build data pipelines and work on analytics.** returned 5 result(s); not relevant: alum-078 (ICT / Digital), alum-174 (ICT / Digital), alum-017 (ICT / Digital).
- **Careers in the energy sector, for example geothermal power.** returned 5 result(s); not relevant: alum-098 (Corporate Services), alum-027 (Commercial).

## Negative control

Off-topic query “Astrophysics research on black holes and galaxy formation.” returned 0 semantic result(s) (similarity threshold applied) and 0 keyword result(s).

## Limitations

- Labels are derived from structured fields, not independent human judgement.
- Synthetic biographies follow templates, which can make semantic and keyword signals easier than real profiles.
- Results depend on the configured similarity threshold and current mentor availability.
