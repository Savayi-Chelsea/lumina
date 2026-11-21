import unittest
from uuid import uuid4

from pydantic import ValidationError

from services.matching.app.hybrid import BM25, fuse, tokens
from services.matching.app.search import RecommendRequest, SearchRequest


class HybridRankingTests(unittest.TestCase):
    def test_tokens_drop_stopwords_and_fold_plurals(self):
        self.assertEqual(tokens("I want to move into Cloud engineering roles"), ["cloud", "engineer", "role"])
        self.assertEqual(tokens("Strategies & companies"), ["strategy", "company"])

    def test_bm25_prefers_rarer_matching_terms(self):
        index = BM25({"a": "Cloud engineer AWS Kubernetes", "b": "Cabin crew customer service", "c": "Customer service cloud"})
        scores = index.scores("kubernetes cloud")
        self.assertGreater(scores["a"], scores["c"])
        self.assertNotIn("b", scores)
        self.assertEqual(index.scores("astrophysics"), {})

    def test_fusion_only_reorders_semantic_candidates(self):
        semantic = ["s1", "s2", "s3", "s4"]
        fused = fuse(semantic, {"s4": 9.0, "s3": 1.0, "outside": 50.0}, top_k=3)
        self.assertEqual(len(fused), 3)
        self.assertTrue(set(fused) <= set(semantic))  # a keyword-only match never enters
        self.assertNotIn("outside", fused)
        self.assertEqual(fuse(semantic, {}, top_k=4), semantic)  # no keyword signal keeps semantic order
        self.assertEqual(fuse([], {"x": 1.0}, top_k=5), [])
        # RRF (k=60): s4 = 1/64 + 1/61 > s3 = 1/63 + 1/62 > s1 = 1/61 > s2 = 1/62.
        self.assertEqual(fused, ["s4", "s3", "s1"])

    def test_request_models_validate_ranking_and_recommendations(self):
        self.assertIsNone(SearchRequest(query="cloud").ranking)
        self.assertEqual(SearchRequest(query="cloud", ranking="hybrid").ranking, "hybrid")
        with self.assertRaises(ValidationError):
            SearchRequest(query="cloud", ranking="random")
        request = RecommendRequest(profile_id=str(uuid4()))
        self.assertEqual((request.top_k, request.exclude), (4, []))
        with self.assertRaises(ValidationError):
            RecommendRequest(profile_id="not-a-uuid")
        with self.assertRaises(ValidationError):
            RecommendRequest(profile_id=str(uuid4()), top_k=21)
        with self.assertRaises(ValidationError):
            RecommendRequest(profile_id=str(uuid4()), unexpected=True)


if __name__ == "__main__":
    unittest.main()
