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
from synthetic_identity import FIXTURE_EMAILS, FIXTURE_PASSWORD, ORIGINAL_FIXTURE_EMAILS, fixture_email, seed_user, validate_fixture_rows
from establish_synthetic_alumni import counts, establish
from local_database import local_dsn
import seed_database


class IdentityTests(unittest.TestCase):
    def test_only_deterministic_fixture_identities_are_allowed(self):
        self.assertEqual(len(FIXTURE_EMAILS), 200)
        self.assertEqual(ORIGINAL_FIXTURE_EMAILS, FIXTURE_EMAILS[:50])
        self.assertEqual(fixture_email("ALUM-001"), "alum-001@synthetic.lumina.local")
        self.assertEqual(fixture_email("ALUM-200"), "alum-200@synthetic.lumina.local")
        for identity in ["ALUM-201", "ALUM-000", "alum-001", "other", "ALUM-001@evil.test"]:
            with self.assertRaises(ValueError):
                fixture_email(identity)

    def test_generator_preserves_the_existing_deterministic_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run([sys.executable, str(ROOT / "scripts/generate_synthetic_data.py")], cwd=directory, check=True, capture_output=True)
            with (Path(directory) / "data/synthetic_alumni.csv").open(newline="", encoding="utf-8") as stream:
                generated = list(csv.DictReader(stream))
            with (ROOT / "data/synthetic_alumni.csv").open(newline="", encoding="utf-8") as stream:
                self.assertEqual(generated, list(csv.DictReader(stream)))
            with (Path(directory) / "data/synthetic_work_history.csv").open(newline="", encoding="utf-8") as stream:
                generated_history = list(csv.DictReader(stream))
            with (ROOT / "data/synthetic_work_history.csv").open(newline="", encoding="utf-8") as stream:
                self.assertEqual(generated_history, list(csv.DictReader(stream)))

    def test_expansion_never_alters_the_original_fifty_rows(self):
        import hashlib, json
        with (ROOT / "data/synthetic_alumni.csv").open(newline="", encoding="utf-8") as stream:
            rows = list(csv.DictReader(stream))
        # Fingerprint of the Sprint I CSV recorded before the Issue #5 expansion.
        self.assertEqual(hashlib.sha256(json.dumps(rows[:50], sort_keys=True).encode()).hexdigest(),
                         "949c1621bb2e60e04e5079ac16396220db7e106760e7c0c37d2069ac8204feac")
        departments = {row["former_kq_department"] for row in rows[50:]}
        self.assertEqual(len(departments), 12)

    def test_every_profile_has_a_coherent_work_history(self):
        with (ROOT / "data/synthetic_alumni.csv").open(newline="", encoding="utf-8") as stream:
            rows = {row["synthetic_id"]: row for row in csv.DictReader(stream)}
        with (ROOT / "data/synthetic_work_history.csv").open(newline="", encoding="utf-8") as stream:
            history = list(csv.DictReader(stream))
        for identity, row in rows.items():
            entries = [entry for entry in history if entry["synthetic_id"] == identity]
            self.assertEqual(entries[0]["organization"], "Kenya Airways")
            self.assertEqual(entries[0]["job_title"], row["former_kq_role"])
            self.assertEqual([entry["is_current"] for entry in entries].count("True"), 1)
            self.assertEqual(entries[-1]["job_title"], row["current_job_title"])

    def test_manifest_rejects_duplicates_missing_and_unknown_identities(self):
        with (ROOT / "data/synthetic_alumni.csv").open(newline="", encoding="utf-8") as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(validate_fixture_rows(rows)), 200)
        for invalid in [rows[:-1], rows + [rows[0]], [*rows[:-1], {**rows[-1], "synthetic_id": "ALUM-201"}]]:
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

    def test_fresh_and_repeat_seed_establish_only_two_hundred_non_login_alumni(self):
        self.assertEqual(counts(self.conn), {"total_synthetic_profiles": 50, "verified_synthetic_alumni": 50, "network_discoverable_alumni": 200})
        work = self.conn.execute("SELECT count(*) FROM work_experience").fetchone()[0]
        self.assertGreaterEqual(work, 400)
        self.seed()
        self.assertEqual(self.conn.execute("SELECT count(*) FROM users").fetchone()[0], 200)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM work_experience").fetchone()[0], work)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM users WHERE google_subject IS NOT NULL OR password_hash <> %s", (FIXTURE_PASSWORD,)).fetchone()[0], 0)

    def test_repair_is_idempotent_and_preserves_signups_profiles_and_preferences(self):
        self.conn.execute("UPDATE users SET alumni_verified=false WHERE email=ANY(%s)", (list(ORIGINAL_FIXTURE_EMAILS),))
        for email, status, role in [("signup@example.test", "pending", "alumni"), ("arbitrary@synthetic.lumina.local", "active", "alumni"), ("alum-201@synthetic.lumina.local", "active", "alumni"), ("suspended@example.test", "suspended", "alumni"), ("admin@example.test", "active", "admin")]:
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
        self.assertEqual(report["after"]["network_discoverable_alumni"], 200)
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
