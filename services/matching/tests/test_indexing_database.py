"""Opt-in live PostgreSQL checks; all mutations roll back."""

import os
from pathlib import Path
import unittest

import psycopg
from dotenv import load_dotenv
from psycopg.conninfo import make_conninfo

from services.matching.app.indexing import index_profiles


class FakeEncoder:
    def encode(self, text):
        return [1.0] + [0.0] * 767


@unittest.skipUnless(os.getenv("LUMINA_TEST_DATABASE") == "1", "Opt in with LUMINA_TEST_DATABASE=1")
class DatabaseTests(unittest.TestCase):
    def test_refresh_removal_availability_and_invalid_vector(self):
        load_dotenv(Path(__file__).resolve().parents[3] / ".env")
        dsn = os.getenv("DATABASE_URL") or make_conninfo(
            host=os.getenv("POSTGRES_HOST", "localhost"), port=os.getenv("POSTGRES_PORT", "5432"),
            user=os.environ["POSTGRES_USER"], password=os.environ["POSTGRES_PASSWORD"],
            dbname=os.environ["POSTGRES_DB"], connect_timeout=10)
        with psycopg.connect(dsn, autocommit=True) as conn:
            with conn.transaction(force_rollback=True):
                profile_id = conn.execute("SELECT profile_id FROM profile_embeddings LIMIT 1").fetchone()[0]
                total = conn.execute("SELECT count(*) FROM profile_embeddings").fetchone()[0]
                original = conn.execute("SELECT embedding::text, indexed_at FROM profile_embeddings WHERE profile_id=%s", (profile_id,)).fetchone()
                def no_load():
                    self.fail("Unchanged profiles must not load the model")
                result = index_profiles(conn, no_load)
                self.assertEqual(result, dict(indexed=0, skipped=total, removed=0, failed=0))
                self.assertEqual(original, conn.execute("SELECT embedding::text, indexed_at FROM profile_embeddings WHERE profile_id=%s", (profile_id,)).fetchone())
                conn.execute("UPDATE mentorship_preferences SET available_for_mentorship=false WHERE profile_id=%s", (profile_id,))
                self.assertEqual(index_profiles(conn, no_load)["skipped"], total)
                conn.execute("UPDATE profiles SET headline=concat(headline, ' integration change') WHERE id=%s", (profile_id,))
                self.assertEqual(index_profiles(conn, FakeEncoder)["indexed"], 1)
                conn.execute("UPDATE mentorship_preferences SET consent_to_matching=false WHERE profile_id=%s", (profile_id,))
                self.assertEqual(index_profiles(conn, no_load)["removed"], 1)
                self.assertIsNone(conn.execute("SELECT id FROM profile_embeddings WHERE profile_id=%s", (profile_id,)).fetchone())
                conn.execute("UPDATE mentorship_preferences SET consent_to_matching=true WHERE profile_id=%s", (profile_id,))
                self.assertEqual(index_profiles(conn, FakeEncoder)["indexed"], 1)
                conn.execute("UPDATE profiles SET headline=concat(headline, ' invalid test') WHERE id=%s", (profile_id,))
                class InvalidEncoder:
                    def encode(self, text):
                        return [float('nan')] * 768
                result = index_profiles(conn, InvalidEncoder)
                self.assertEqual(result["failed"], 1)
                self.assertEqual(result["removed"], 1)
            self.assertEqual(conn.execute("SELECT count(*) FROM profile_embeddings").fetchone()[0], total)
            self.assertEqual(original, conn.execute("SELECT embedding::text, indexed_at FROM profile_embeddings WHERE profile_id=%s", (profile_id,)).fetchone())
