# Quantitative findings for the abstract

Each finding is a measured result from this repository; the source file is given so it
can be checked. All results are on synthetic data (200 fictional former-KQ profiles,
133 eligible mentors) and one shared cloud development machine.

## Mentor matching (22 labelled queries, k = 5)

1. Semantic matching (pre-trained BGE embeddings, exact cosine similarity in pgvector)
   achieved **Precision@5 = 0.827, Recall@5 = 0.476, F1@5 = 0.567 and MRR@5 = 0.898**,
   against 0.773 / 0.410 / 0.510 / 0.849 for a TF-IDF keyword baseline over the same
   profiles, queries and eligibility rules. *(results/matching/comparison.csv)*
2. On career-transition queries semantic matching scored **F1@5 0.482 vs 0.358** and
   **MRR@5 0.775 vs 0.667** for keyword search, higher F1 on 6 of the 9 queries where the
   systems differed. With 10 such queries the difference was not statistically significant
   (Wilcoxon p = 0.20). *(results/matching/significance.csv)*
3. On domain queries all three methods were identical (P@5 = 1.000), and a hybrid
   semantic + BM25 ranker did not beat semantic ranking on any average, so it was not adopted.
   *(results/matching_evaluation.md)*
4. The 0.50 similarity threshold returned **no results for an off-topic query** while
   keeping five results for every real query. 0.40 admitted 5 off-topic mentors, and 0.60
   reduced Precision@5 to 0.518. *(results/matching/threshold_sweep.csv)*

## Correctness, consent and explanations

5. The live service's rankings matched an independent exact re-computation in **46 of 46**
   checks. **0** of 67 non-consenting or unavailable synthetic mentors were ever returned,
   although each unavailable mentor would rank in the top 5 for its own headline without
   the filter. *(results/correctness/summary.json)*
6. **All 266** "Why this match" sentences produced for 110 results were grounded in the
   mentor's stored profile attributes; none was invented. *(results/correctness/explanations_summary.json)*

## Event-driven re-indexing (outbox → Kafka → worker → pgvector)

7. Profile changes reached live search in a **median of 1.1 s** (0.7–10.7 s over 7
   measured propagations). Eight duplicate events and a malformed event caused no
   duplicate embeddings and no lost changes. *(results/event_pipeline/summary.json)*
8. With Kafka stopped, changes were held in the outbox and applied **0.9 s** after the broker
   returned. Withdrawing consent hid a mentor from search in **0.13 s** and deleted their
   embedding in **0.4 s**. All **18 of 18** resilience checks passed after one defect was
   fixed: the worker previously crashed when started before Kafka.
   *(results/event_pipeline/scenarios.csv)*

## Performance (4 vCPU, 15.6 GB, all services on one machine)

9. An idle mentor search took a **median of 105 ms** end to end (p95 151 ms); ordinary pages
   took **15 ms** (p95 27 ms). **0 errors in 1,069 requests.** *(results/performance/summary.csv)*
10. With 8 simultaneous mentor searches, page response stayed at a **median of 20 ms**
    (p95 36 ms), while mentor-search latency rose to a **median of 958 ms**. Throughput
    levelled off at about **8.4 searches/s**, because model inference is serialised: one
    matching instance is the scaling limit, not the web tier. *(results/performance/)*

## Testing

11. **439 automated tests and end-to-end scenarios passed with 0 failures**, including 325 web-app tests, 78 matching/worker/data tests against live PostgreSQL and Kafka, and 36 production HTTP and browser journeys. *(results/tests/summary.md)*

## Scale-up to 500 profiles and 45 queries (DATASET_EXPANSION_REPORT.md)

12. On the same 22 queries, growing the corpus from 200 profiles (133 eligible mentors) to 500
    (325) raised semantic **Precision@5 from 0.827 to 0.936** (Wilcoxon p = 0.041) and
    **MRR@5 from 0.898 to 1.000**. Semantic's precision lead over keyword widened from +0.054 to
    +0.100. *(results/expanded/comparison/subsets.csv)*
13. Across 45 queries in six categories on 500 profiles, the three methods were close overall
    (F1@5: semantic 0.397, keyword 0.378, hybrid 0.401; no significant difference). On
    **career-transition queries semantic matching was significantly better** (F1@5 0.491 vs
    0.324, higher on all 8 differing queries, p = 0.012). Keyword matching did better on queries
    that name an exact skill, industry or topic. *(results/expanded/comparison/by_set.csv)*
14. Search latency was almost unaffected by corpus size: median **88.5 → 91.0 ms**, p95
    **110.0 → 111.2 ms** over 225 identical searches per corpus. *(results/expanded/comparison/latency.csv)*

## Not yet measured

- Usability (task success, time, SUS): the kit is prepared in `usability/`; no sessions
  have been run, so no usability figures can be stated.
