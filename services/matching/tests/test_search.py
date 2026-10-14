import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from services.matching.app.config import SearchSettings
from services.matching.app.indexing import EmbeddingInputTooLong
from services.matching.app.main import app, search_settings
from services.matching.app.search import MAX_QUERY_LENGTH, QUERY_INSTRUCTION, SearchRequest, SearchResponse, search_mentors


class APITests(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[search_settings] = lambda: SearchSettings()
        self.client = TestClient(app)
        self.encoder_patch = patch("services.matching.app.main.query_encoder")
        self.encoder = self.encoder_patch.start()
        self.db_patch = patch("services.matching.app.main.psycopg.connect")
        self.db = self.db_patch.start()
        self.search_patch = patch("services.matching.app.main.search_mentors", return_value=SearchResponse(
            results=[], top_k=5, similarity_threshold=0.5))
        self.search = self.search_patch.start()

    def tearDown(self):
        self.search_patch.stop()
        self.db_patch.stop()
        self.encoder_patch.stop()
        app.dependency_overrides.clear()
        self.client.close()

    def test_valid_query_is_sanitized(self):
        response = self.client.post("/mentors/search", json={"query": "  AWS\n Docker mentorship  "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.search.call_args.args[2].query, "AWS Docker mentorship")
        self.assertEqual(response.json(), {"results": [], "top_k": 5, "similarity_threshold": 0.5})

    def test_empty_query(self):
        for query in ("", " \t\n "):
            with self.subTest(query=query):
                self.assertEqual(self.client.post("/mentors/search", json={"query": query}).status_code, 422)
        self.encoder.assert_not_called()
        self.db.assert_not_called()

    def test_overlength_query(self):
        self.assertEqual(MAX_QUERY_LENGTH, 500)
        self.assertEqual(SearchRequest.model_json_schema()["properties"]["query"]["maxLength"], 500)
        for query in ("x" * 501, "AWS" + " " * 498):
            with self.subTest(length=len(query)):
                response = self.client.post("/mentors/search", json={"query": query})
                self.assertEqual(response.status_code, 422)
                self.assertIn("500 characters", response.text)
        self.encoder.assert_not_called()
        self.db.assert_not_called()
        self.assertNotIn("input", response.text)

    def test_query_at_500_character_boundary(self):
        response = self.client.post("/mentors/search", json={"query": "x" * 500})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.search.call_args.args[2].query), 500)

    def test_controls_and_invalid_types(self):
        for payload in ({"query": "AWS\u0000"}, {"query": "AWS\u200b"}, {"query": 123}, {},
                        {"query": "AWS", "extra": 1}, {"query": "AWS", "top_k": True},
                        {"query": "AWS", "top_k": 0}, {"query": "AWS", "top_k": 51},
                        {"query": "AWS", "similarity_threshold": 1.1},
                        {"query": "AWS", "similarity_threshold": "0.5"}):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/mentors/search", json=payload).status_code, 422)
        self.encoder.assert_not_called()

    def test_overrides(self):
        self.client.post("/mentors/search", json={"query": "AWS", "top_k": 3, "similarity_threshold": 0.7})
        request = self.search.call_args.args[2]
        self.assertEqual(request.top_k, 3)
        self.assertEqual(request.similarity_threshold, 0.7)

    def test_token_limit(self):
        self.search.side_effect = EmbeddingInputTooLong()
        response = self.client.post("/mentors/search", json={"query": "AWS"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Query exceeds the model token limit")

    def test_dependency_failure_is_safe(self):
        self.db.side_effect = RuntimeError("secret credentials")
        response = self.client.post("/mentors/search", json={"query": "AWS"})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("secret", response.text)

    def test_health_preserved(self):
        self.assertEqual(self.client.get("/health").json(), {"status": "ok", "service": "matching"})


class VectorTests(unittest.TestCase):
    def test_query_instruction_and_parameterization(self):
        encoder = MagicMock()
        encoder.encode.return_value = [1.0] + [0.0] * 767
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = []
        query = "AWS'; DROP TABLE profiles; --"
        result = search_mentors(conn, encoder, SearchRequest(query=query), SearchSettings())
        encoder.encode.assert_called_once_with(QUERY_INSTRUCTION + query)
        sql, params = cursor.execute.call_args.args
        self.assertNotIn(query, sql)
        self.assertIn("<=>", sql)
        self.assertEqual(params["top_k"], 5)
        self.assertEqual(result.results, [])

    def test_invalid_vectors(self):
        for vector in ([1.0] * 767, [float("nan")] * 768, [float("inf")] * 768, [0.0] * 768):
            with self.subTest(size=len(vector)):
                encoder = MagicMock()
                encoder.encode.return_value = vector
                conn = MagicMock()
                with self.assertRaises(RuntimeError):
                    search_mentors(conn, encoder, SearchRequest(query="AWS"), SearchSettings())
                conn.cursor.assert_not_called()

    def test_environment_defaults_can_be_overridden(self):
        from services.matching.app.config import get_settings
        get_settings.cache_clear()
        with patch.dict("os.environ", {"MATCHING_TOP_K": "3", "MATCHING_SIMILARITY_THRESHOLD": "0.65"}):
            settings = get_settings()
            self.assertEqual(settings.top_k, 3)
            self.assertEqual(settings.similarity_threshold, 0.65)
        get_settings.cache_clear()
