# 200- vs 500-profile matching comparison

200-profile corpus: 133 eligible mentors; 500-profile corpus: 325 eligible mentors. Same model, threshold (0.5), k = 5, code and rules. Unanswerable at 200 (no relevant mentor, not scored): t-developer, t-product, t-ngo, t-healthcare, l-executive, l-strategy, i-tourism, i-government, i-agriculture, i-real-estate, b-next-step, b-business.

| Subset | Corpus | System | Queries | P@5 | R@5 | Normalised R@5 | F1@5 [95% CI] | MRR@5 [95% CI] | Mean relevant |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| original_22 | 200 | Semantic | 22 | 0.827 | 0.476 | 0.864 | 0.567 [0.485-0.642] | 0.898 [0.773-1.000] | 10.2 |
| original_22 | 200 | Keyword (TF-IDF) | 22 | 0.773 | 0.410 | 0.791 | 0.510 [0.421-0.595] | 0.849 [0.712-0.955] | 10.2 |
| original_22 | 200 | Hybrid (BGE + BM25) | 22 | 0.809 | 0.463 | 0.843 | 0.552 [0.471-0.626] | 0.856 [0.727-0.955] | 10.2 |
| original_22 | 500 | Semantic | 22 | 0.936 | 0.210 | 0.936 | 0.332 [0.292-0.382] | 1.000 [1.000-1.000] | 25.7 |
| original_22 | 500 | Keyword (TF-IDF) | 22 | 0.836 | 0.175 | 0.836 | 0.281 [0.237-0.322] | 0.901 [0.780-1.000] | 25.7 |
| original_22 | 500 | Hybrid (BGE + BM25) | 22 | 0.909 | 0.202 | 0.909 | 0.319 [0.274-0.373] | 0.947 [0.864-1.000] | 25.7 |
| common | 200 | Semantic | 33 | 0.721 | 0.444 | 0.751 | 0.519 [0.430-0.600] | 0.818 [0.682-0.932] | 8.8 |
| common | 200 | Keyword (TF-IDF) | 33 | 0.751 | 0.484 | 0.790 | 0.554 [0.461-0.640] | 0.838 [0.717-0.939] | 8.8 |
| common | 200 | Hybrid (BGE + BM25) | 33 | 0.739 | 0.472 | 0.775 | 0.542 [0.457-0.620] | 0.819 [0.692-0.924] | 8.8 |
| common | 500 | Semantic | 33 | 0.849 | 0.222 | 0.849 | 0.337 [0.284-0.390] | 0.925 [0.834-1.000] | 25.2 |
| common | 500 | Keyword (TF-IDF) | 33 | 0.867 | 0.219 | 0.867 | 0.333 [0.274-0.394] | 0.919 [0.833-0.985] | 25.2 |
| common | 500 | Hybrid (BGE + BM25) | 33 | 0.879 | 0.233 | 0.879 | 0.351 [0.289-0.415] | 0.934 [0.848-1.000] | 25.2 |
| all | 200 | Semantic | 33 | 0.721 | 0.444 | 0.751 | 0.519 [0.430-0.600] | 0.818 [0.682-0.932] | 8.8 |
| all | 200 | Keyword (TF-IDF) | 33 | 0.751 | 0.484 | 0.790 | 0.554 [0.461-0.640] | 0.838 [0.717-0.939] | 8.8 |
| all | 200 | Hybrid (BGE + BM25) | 33 | 0.739 | 0.472 | 0.775 | 0.542 [0.457-0.620] | 0.819 [0.692-0.924] | 8.8 |
| all | 500 | Semantic | 45 | 0.813 | 0.310 | 0.831 | 0.397 [0.330-0.467] | 0.927 [0.850-0.985] | 24.0 |
| all | 500 | Keyword (TF-IDF) | 45 | 0.831 | 0.279 | 0.832 | 0.378 [0.305-0.453] | 0.918 [0.841-0.978] | 24.0 |
| all | 500 | Hybrid (BGE + BM25) | 45 | 0.844 | 0.309 | 0.859 | 0.401 [0.330-0.473] | 0.941 [0.874-0.989] | 24.0 |

## By query type

| Corpus | Query set | Queries | Semantic F1@5 | Keyword F1@5 | Hybrid F1@5 | Semantic MRR@5 | Keyword MRR@5 | Hybrid MRR@5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 200 | domain | 12 | 0.637 | 0.637 | 0.637 | 1.000 | 1.000 | 1.000 |
| 200 | skill | 6 | 0.626 | 0.834 | 0.690 | 1.000 | 1.000 | 1.000 |
| 200 | transition | 11 | 0.439 | 0.325 | 0.410 | 0.705 | 0.606 | 0.621 |
| 200 | leadership | 3 | 0.296 | 0.685 | 0.528 | 0.417 | 1.000 | 0.733 |
| 200 | broad | 1 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 200 | all | 33 | 0.519 | 0.554 | 0.542 | 0.818 | 0.838 | 0.819 |
| 500 | domain | 12 | 0.289 | 0.289 | 0.289 | 1.000 | 1.000 | 1.000 |
| 500 | skill | 6 | 0.472 | 0.580 | 0.580 | 1.000 | 1.000 | 1.000 |
| 500 | transition | 15 | 0.491 | 0.324 | 0.428 | 1.000 | 0.789 | 0.922 |
| 500 | leadership | 5 | 0.156 | 0.224 | 0.176 | 0.707 | 1.000 | 1.000 |
| 500 | industry | 4 | 0.783 | 0.883 | 0.833 | 1.000 | 1.000 | 1.000 |
| 500 | broad | 3 | 0.098 | 0.185 | 0.148 | 0.400 | 0.833 | 0.500 |
| 500 | all | 45 | 0.397 | 0.378 | 0.401 | 0.927 | 0.918 | 0.941 |

## Latency (ms, same machine, sequential)

| Corpus | System | Timed calls | Median | p95 | Max |
| --- | --- | --- | --- | --- | --- |
| 200 | semantic | 33 | 88.8 | 125.5 | 133.6 |
| 200 | keyword_baseline | 33 | 1.6 | 2.0 | 2.0 |
| 200 | hybrid | 33 | 90.4 | 108.1 | 112.8 |
| 200 | semantic_repeated | 225 | 88.5 | 110.0 | 139.4 |
| 500 | semantic | 45 | 89.3 | 107.1 | 110.6 |
| 500 | keyword_baseline | 45 | 1.9 | 2.5 | 4.3 |
| 500 | hybrid | 45 | 92.5 | 110.8 | 140.2 |
| 500 | semantic_repeated | 225 | 91.0 | 111.2 | 130.6 |

`semantic_repeated` times the production search for all 45 labelled queries in 5 rounds on each corpus (identical query set).

## Paired Wilcoxon signed-rank tests

| Comparison | Subset | System | Metric | Queries | Mean (500) | Mean (200) | Non-zero pairs | p |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 500 vs 200 corpus | original_22 | Semantic | precision_at_5 | 22 | 0.9364 | 0.8273 | 7 | 0.0407 |
| 500 vs 200 corpus | original_22 | Semantic | normalised_recall_at_5 | 22 | 0.9364 | 0.8636 | 6 | 0.1682 |
| 500 vs 200 corpus | original_22 | Semantic | reciprocal_rank | 22 | 1.0 | 0.8977 | 3 | 0.1088 |
| 500 vs 200 corpus | original_22 | Keyword (TF-IDF) | precision_at_5 | 22 | 0.8364 | 0.7727 | 7 | 0.1268 |
| 500 vs 200 corpus | original_22 | Keyword (TF-IDF) | normalised_recall_at_5 | 22 | 0.8364 | 0.7909 | 7 | 0.2041 |
| 500 vs 200 corpus | original_22 | Keyword (TF-IDF) | reciprocal_rank | 22 | 0.9015 | 0.8485 | 4 | 0.2568 |
| 500 vs 200 corpus | original_22 | Hybrid (BGE + BM25) | precision_at_5 | 22 | 0.9091 | 0.8091 | 8 | 0.065 |
| 500 vs 200 corpus | original_22 | Hybrid (BGE + BM25) | normalised_recall_at_5 | 22 | 0.9091 | 0.8432 | 8 | 0.2597 |
| 500 vs 200 corpus | original_22 | Hybrid (BGE + BM25) | reciprocal_rank | 22 | 0.947 | 0.8561 | 4 | 0.1441 |
| 500 vs 200 corpus | common | Semantic | precision_at_5 | 33 | 0.8485 | 0.7212 | 12 | 0.0133 |
| 500 vs 200 corpus | common | Semantic | normalised_recall_at_5 | 33 | 0.8485 | 0.751 | 12 | 0.0541 |
| 500 vs 200 corpus | common | Semantic | reciprocal_rank | 33 | 0.9253 | 0.8182 | 6 | 0.0458 |
| 500 vs 200 corpus | common | Keyword (TF-IDF) | precision_at_5 | 33 | 0.8667 | 0.7515 | 12 | 0.0117 |
| 500 vs 200 corpus | common | Keyword (TF-IDF) | normalised_recall_at_5 | 33 | 0.8667 | 0.7899 | 10 | 0.0525 |
| 500 vs 200 corpus | common | Keyword (TF-IDF) | reciprocal_rank | 33 | 0.9192 | 0.8384 | 6 | 0.0845 |
| 500 vs 200 corpus | common | Hybrid (BGE + BM25) | precision_at_5 | 33 | 0.8788 | 0.7394 | 14 | 0.0099 |
| 500 vs 200 corpus | common | Hybrid (BGE + BM25) | normalised_recall_at_5 | 33 | 0.8788 | 0.7747 | 14 | 0.0827 |
| 500 vs 200 corpus | common | Hybrid (BGE + BM25) | reciprocal_rank | 33 | 0.9343 | 0.8192 | 6 | 0.0458 |
| semantic vs keyword_baseline | all at 200 |  | f1_at_5 | 33 |  | 0.5188 | 15 | 0.4603 |
| semantic vs keyword_baseline | all at 200 |  | reciprocal_rank | 33 |  | 0.8182 | 7 | 0.6715 |
| semantic vs hybrid | all at 200 |  | f1_at_5 | 33 |  | 0.5188 | 8 | 0.2076 |
| semantic vs hybrid | all at 200 |  | reciprocal_rank | 33 |  | 0.8182 | 5 | 0.8923 |
| semantic vs keyword_baseline | all at 500 |  | f1_at_5 | 45 | 0.3971 |  | 19 | 0.7022 |
| semantic vs keyword_baseline | all at 500 |  | reciprocal_rank | 45 | 0.9274 |  | 8 | 0.7784 |
| semantic vs hybrid | all at 500 |  | f1_at_5 | 45 | 0.3971 |  | 13 | 0.2944 |
| semantic vs hybrid | all at 500 |  | reciprocal_rank | 45 | 0.9274 |  | 5 | 0.5879 |
