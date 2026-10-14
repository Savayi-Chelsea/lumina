import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from services.matching.app.config import SearchSettings
from services.matching.app.indexing import EmbeddingInputTooLong
from services.matching.app import main
from services.matching.app.search import EmbeddingUnavailable
from services.matching.app.main import app, search_settings
from services.matching.app.search import MAX_QUERY_LENGTH, QUERY_INSTRUCTION, SearchRequest, SearchResponse, search_mentors


class APITests(unittest.TestCase):
    def setUp(self):
        self.health_patch = patch.object(main, "_model_healthy", True)
        self.health_patch.start()
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
        self.health_patch.stop()
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

    def test_ready_checks_database_without_inference(self):
        response = self.client.get("/ready")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ready", "service": "matching"})
        self.encoder.return_value.encode.assert_not_called()
        self.search.assert_not_called()
        conn = self.db.return_value.__enter__.return_value
        sql = conn.cursor.return_value.__enter__.return_value.execute.call_args.args[0]
        self.assertTrue(sql.startswith("EXPLAIN "))

    def test_ready_database_unavailable(self):
        self.db.side_effect = RuntimeError("password SELECT profile source text")
        response = self.client.get("/ready")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "not_ready", "service": "matching"})
        self.encoder.assert_not_called()
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_ready_schema_unavailable(self):
        conn = self.db.return_value.__enter__.return_value
        conn.cursor.return_value.__enter__.return_value.execute.side_effect = RuntimeError("SQL secret")
        self.assertEqual(self.client.get("/ready").status_code, 503)

    def test_ready_configuration_unavailable(self):
        with patch.object(main, "get_settings", side_effect=ValueError("credentials")):
            response = self.client.get("/ready")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("credentials", response.text)

    def test_model_load_failure_is_safe(self):
        with patch.object(main, "_encoder", None), patch.object(main, "BGEEncoder", side_effect=RuntimeError("password source SQL")):
            self.encoder.side_effect = lambda: original_query_encoder()
            response = self.client.post("/mentors/search", json={"query": "AWS"})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json(), {"detail": "Embedding model unavailable"})
            self.assertEqual(self.client.get("/ready").status_code, 503)

    def test_inference_failure_and_recovery_readiness(self):
        self.search.side_effect = EmbeddingUnavailable("secret source text")
        response = self.client.post("/mentors/search", json={"query": "AWS"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"detail": "Embedding model unavailable"})
        self.assertEqual(self.client.get("/ready").status_code, 503)
        self.search.side_effect = None
        self.assertEqual(self.client.post("/mentors/search", json={"query": "AWS"}).status_code, 200)
        self.assertEqual(self.client.get("/ready").status_code, 200)

    def test_validation_does_not_echo_unknown_field_or_input(self):
        response = self.client.post("/mentors/search", json={"query": "AWS", "private source password": "secret"})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("private", response.text)
        self.assertNotIn("secret", response.text)

    def test_unexpected_response_failure_is_safe(self):
        self.search.return_value = {"results": [{"biography": "private source password"}]}
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post("/mentors/search", json={"query": "AWS"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"detail": "Mentor search temporarily unavailable"})

    def test_model_reused_across_search_and_readiness(self):
        with patch.object(main, "_encoder", None), patch.object(main, "BGEEncoder") as factory:
            self.encoder.side_effect = lambda: original_query_encoder()
            for _ in range(3):
                self.assertEqual(self.client.post("/mentors/search", json={"query": "AWS"}).status_code, 200)
                self.assertEqual(self.client.get("/ready").status_code, 200)
            factory.assert_called_once_with()
            for call in self.search.call_args_list:
                self.assertIs(call.args[1], factory.return_value)

    def test_concurrent_model_initialization_is_singleton(self):
        with patch.object(main, "_encoder", None), patch.object(main, "BGEEncoder") as factory:
            with ThreadPoolExecutor(max_workers=4) as workers:
                encoders = list(workers.map(lambda _: original_query_encoder(), range(8)))
            factory.assert_called_once_with()
            self.assertTrue(all(encoder is factory.return_value for encoder in encoders))


original_query_encoder = main.query_encoder


class VectorTests(unittest.TestCase):
    def test_inference_exception_is_classified(self):
        encoder = MagicMock()
        encoder.encode.side_effect = RuntimeError("raw model failure")
        with self.assertRaises(EmbeddingUnavailable):
            search_mentors(MagicMock(), encoder, SearchRequest(query="AWS"), SearchSettings())

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
