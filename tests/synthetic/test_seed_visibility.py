"""Exact deterministic demo identities may be established; signup accounts may not."""
import contextlib
import csv
import io
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from synthetic_identity import FIXTURE_EMAILS, FIXTURE_PASSWORD, fixture_email, seed_user, validate_fixture_rows
from establish_synthetic_alumni import counts, establish
from local_database import local_dsn
import seed_database


class IdentityTests(unittest.TestCase):
    def test_only_original_fifty_identities_are_allowed(self):
        self.assertEqual(len(FIXTURE_EMAILS), 50)
        self.assertEqual(fixture_email("ALUM-001"), "alum-001@synthetic.lumina.local")
        for identity in ["ALUM-051", "ALUM-000", "alum-001", "other", "ALUM-001@evil.test"]:
            with self.assertRaises(ValueError):
                fixture_email(identity)

    def test_generator_preserves_the_existing_deterministic_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run([sys.executable, str(ROOT / "scripts/generate_synthetic_data.py")], cwd=directory, check=True, capture_output=True)
            with (Path(directory) / "data/synthetic_alumni.csv").open(newline="", encoding="utf-8") as stream:
                generated = list(csv.DictReader(stream))
            with (ROOT / "data/synthetic_alumni.csv").open(newline="", encoding="utf-8") as stream:
                self.assertEqual(generated, list(csv.DictReader(stream)))

    def test_manifest_rejects_duplicates_missing_and_unknown_identities(self):
        with (ROOT / "data/synthetic_alumni.csv").open(newline="", encoding="utf-8") as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(validate_fixture_rows(rows)), 50)
        for invalid in [rows[:-1], rows + [rows[0]], [*rows[:-1], {**rows[-1], "synthetic_id": "ALUM-051"}]]:
            with self.assertRaises(ValueError):
                validate_fixture_rows(invalid)


@unittest.skipUnless(os.getenv("LUMINA_TEST_DATABASE") == "1", "Opt in to local database tests")
class SeedDatabaseTests(unittest.TestCase):
    def setUp(self):
        import psycopg
        self.conn = psycopg.connect(local_dsn())
        self.addCleanup(self.conn.close)
        for table in ["users", "profiles", "skills", "profile_skills", "mentorship_preferences", "work_experience"]:
            self.conn.execute(f"CREATE TEMP TABLE {table} (LIKE public.{table} INCLUDING ALL)")
        self.seed()

    def seed(self):
        # Run the actual complete seed script against session-local tables only.
        with patch.object(seed_database.psycopg, "connect", return_value=contextlib.nullcontext(self.conn)), contextlib.redirect_stdout(io.StringIO()):
            seed_database.main()

    def test_fresh_and_repeat_seed_establish_only_fifty_non_login_alumni(self):
        self.assertEqual(counts(self.conn), {"total_synthetic_profiles": 50, "verified_synthetic_alumni": 50, "network_discoverable_alumni": 50})
        self.seed()
        self.assertEqual(self.conn.execute("SELECT count(*) FROM users").fetchone()[0], 50)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM users WHERE google_subject IS NOT NULL OR password_hash <> %s", (FIXTURE_PASSWORD,)).fetchone()[0], 0)

    def test_repair_is_idempotent_and_preserves_signups_profiles_and_preferences(self):
        self.conn.execute("UPDATE users SET alumni_verified=false WHERE email=ANY(%s)", (list(FIXTURE_EMAILS),))
        for email, status, role in [("signup@example.test", "pending", "alumni"), ("arbitrary@synthetic.lumina.local", "active", "alumni"), ("alum-051@synthetic.lumina.local", "active", "alumni"), ("suspended@example.test", "suspended", "alumni"), ("admin@example.test", "active", "admin")]:
            self.conn.execute("INSERT INTO users(email,account_status,role,google_subject) VALUES(%s,%s,%s,%s)", (email,status,role,email))
        self.conn.execute("INSERT INTO users(email,password_hash,account_status,alumni_verified) VALUES('password-signup@example.test','normal-hashed-password','pending',false)")
        def controls():
            return self.conn.execute("SELECT to_jsonb(u) FROM users u WHERE NOT email=ANY(%s) ORDER BY email", (list(FIXTURE_EMAILS),)).fetchall()
        before = controls()
        preferences = self.conn.execute("SELECT to_jsonb(m) FROM mentorship_preferences m ORDER BY id").fetchall()
        profiles = self.conn.execute("SELECT to_jsonb(p) FROM profiles p ORDER BY id").fetchall()
        self.assertEqual(establish(self.conn)["before"]["verified_synthetic_alumni"], 0)
        report = establish(self.conn, True)
        self.assertEqual(report["updated"], 50)
        self.assertEqual(report["after"]["network_discoverable_alumni"], 50)
        self.assertEqual(establish(self.conn, True)["updated"], 0)
        self.assertEqual(before, controls())
        self.assertEqual(preferences, self.conn.execute("SELECT to_jsonb(m) FROM mentorship_preferences m ORDER BY id").fetchall())
        self.assertEqual(profiles, self.conn.execute("SELECT to_jsonb(p) FROM profiles p ORDER BY id").fetchall())

    def test_protected_fixture_collisions_are_never_promoted_or_reactivated(self):
        import psycopg
        for assignments in ["account_status='suspended'", "account_status='pending'", "role='admin'", "google_subject='normal-google-subject'", "password_hash='normal-password-hash'"]:
            with self.subTest(assignments=assignments), self.conn.transaction():
                self.conn.execute(f"UPDATE users SET {assignments}, alumni_verified=false WHERE email=%s", (FIXTURE_EMAILS[0],))
                before = self.conn.execute("SELECT to_jsonb(u) FROM users u ORDER BY id").fetchall()
                with self.assertRaises(ValueError):
                    establish(self.conn, True)
                with self.assertRaises(ValueError):
                    seed_user(self.conn, FIXTURE_EMAILS[0])
                self.assertEqual(before, self.conn.execute("SELECT to_jsonb(u) FROM users u ORDER BY id").fetchall())
                raise psycopg.Rollback()

    def test_repair_refuses_missing_profiles_and_unknown_seed_identity(self):
        self.conn.execute("DELETE FROM profiles WHERE user_id=(SELECT id FROM users WHERE email=%s)", (FIXTURE_EMAILS[0],))
        with self.assertRaises(ValueError):
            establish(self.conn, True)
        with self.assertRaises(ValueError):
            seed_user(self.conn, "someone@synthetic.lumina.local")


if __name__ == "__main__":
    unittest.main()
