"""Actual pgvector SQL against session-local fixtures, never real profiles."""

import math
import os
import unittest
from uuid import UUID

import psycopg

from services.matching.app.config import SearchSettings, database_dsn
from services.matching.app.indexing import MODEL_NAME
from services.matching.app.search import SearchRequest, search_mentors


class TestEncoder:
    def encode(self, text):
        return [1.0] + [0.0] * 767


@unittest.skipUnless(os.getenv("LUMINA_TEST_DATABASE") == "1", "Opt in with LUMINA_TEST_DATABASE=1")
class SearchDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg.connect(database_dsn(), autocommit=True)
        self.addCleanup(self.conn.close)
        for table in ("profiles", "profile_embeddings", "mentorship_preferences", "skills", "profile_skills"):
            # Constant internal table names, not request input. Temporary tables shadow public tables.
            self.conn.execute(f"CREATE TEMP TABLE {table} (LIKE public.{table} INCLUDING ALL)")
        for number, score, consent, available, model in (
            (1, 1.0, True, True, MODEL_NAME), (2, 0.8, True, True, MODEL_NAME),
            (3, 0.6, True, True, MODEL_NAME), (4, 1.0, False, True, MODEL_NAME),
            (5, 1.0, True, False, MODEL_NAME), (6, 1.0, True, True, "different-model"),
            (7, 0.8, True, True, MODEL_NAME)):
            pid = UUID(int=number)
            self.conn.execute("""INSERT INTO profiles
                (id, user_id, full_name, headline, former_kq_role, former_kq_department,
                 current_job_title, current_organization)
                VALUES (%s,%s,'Fixture','Cloud engineer','Systems Administrator','ICT / Digital',
                        'Cloud Engineer','Fixture organization')""", (pid, pid))
            self.conn.execute("""INSERT INTO mentorship_preferences
                (profile_id,consent_to_matching,available_for_mentorship) VALUES (%s,%s,%s)""", (pid, consent, available))
            vector = [score, math.sqrt(1 - score * score)] + [0.0] * 766
            self.conn.execute("""INSERT INTO profile_embeddings
                (profile_id,embedding,model_name,source_hash) VALUES (%s,%s::vector,%s,'fixture')""",
                (pid, "[" + ",".join(map(str, vector)) + "]", model))
        for number, skill in ((100, "Python"), (101, "AWS")):
            self.conn.execute("INSERT INTO skills(id,name) VALUES (%s,%s)", (UUID(int=number), skill))
            self.conn.execute("INSERT INTO profile_skills VALUES (%s,%s)", (UUID(int=1), UUID(int=number)))

    def search(self, **kwargs):
        return search_mentors(self.conn, TestEncoder(), SearchRequest(query="Cloud mentorship", **kwargs), SearchSettings())

    def test_valid_query_returns_fields_and_skills(self):
        first = self.search().results[0]
        self.assertEqual(first.profile_id, UUID(int=1))
        self.assertEqual(first.relevant_skills, ["AWS", "Python"])
        self.assertEqual(first.former_kq_department, "ICT / Digital")
        self.assertEqual(first.current_job_title, "Cloud Engineer")

    def test_no_eligible_matches(self):
        self.conn.execute("UPDATE mentorship_preferences SET consent_to_matching=false")
        self.assertEqual(self.search().results, [])

    def test_consent_filtering(self):
        self.assertNotIn(UUID(int=4), [r.profile_id for r in self.search().results])
        self.conn.execute("UPDATE mentorship_preferences SET consent_to_matching=false WHERE profile_id=%s", (UUID(int=1),))
        self.assertNotIn(UUID(int=1), [r.profile_id for r in self.search().results])

    def test_availability_filtering(self):
        self.assertNotIn(UUID(int=5), [r.profile_id for r in self.search().results])
        self.conn.execute("UPDATE mentorship_preferences SET available_for_mentorship=false WHERE profile_id=%s", (UUID(int=1),))
        self.assertNotIn(UUID(int=1), [r.profile_id for r in self.search().results])

    def test_ranked_results_and_tie_break(self):
        results = self.search().results
        self.assertEqual([r.profile_id.int for r in results], [1, 2, 7, 3])
        for r, score in zip(results, [1.0, 0.8, 0.8, 0.6]):
            self.assertAlmostEqual(r.similarity_score, score, places=5)

    def test_threshold_and_top_k_after_filtering(self):
        self.assertEqual([r.profile_id.int for r in self.search(top_k=2, similarity_threshold=0.7).results], [1, 2])
        self.assertEqual(self.search(similarity_threshold=1.0).results[0].profile_id.int, 1)
        self.conn.execute("UPDATE mentorship_preferences SET available_for_mentorship=false WHERE profile_id=%s", (UUID(int=1),))
        self.assertEqual(self.search(similarity_threshold=0.9).results, [])

    def test_model_filtering(self):
        self.assertNotIn(UUID(int=6), [r.profile_id for r in self.search().results])
