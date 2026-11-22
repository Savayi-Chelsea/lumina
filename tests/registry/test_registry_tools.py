"""Synthetic registry tools: deterministic output and safe repeat imports."""
import csv
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from generate_alumni_registry import FIELDS, generate, registry_rows  # noqa: E402
from import_alumni_registry import import_rows  # noqa: E402
from local_database import local_dsn  # noqa: E402


class GeneratorTests(unittest.TestCase):
    def test_existing_dataset_is_deterministic_and_minimal(self):
        source = ROOT / "data/synthetic_alumni.csv"
        self.assertEqual(registry_rows(source), registry_rows(source))
        rows = registry_rows(source)
        # One fixture per synthetic alumnus: ALUM-001..ALUM-200 since the dataset expansion.
        self.assertEqual(len(rows), 200)
        self.assertEqual(len({row["id"] for row in rows}), 200)
        self.assertEqual(rows[-1]["synthetic_staff_number"], "SYN-ALUM-200")
        self.assertEqual(set(rows[0]), set(FIELDS))
        self.assertEqual(rows[0]["synthetic_staff_number"], "SYN-ALUM-001")
        self.assertEqual(rows[0]["surname"], "Wafula")
        self.assertNotIn("full_name", rows[0])
        self.assertNotIn("email", rows[0])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "fixtures.csv"
            generate(output=output)
            first = output.read_bytes()
            generate(output=output)
            self.assertEqual(first, output.read_bytes())

    def test_duplicate_source_identifiers_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "duplicate.csv"
            with source.open("w", newline="", encoding="utf-8") as stream:
                fields = ["synthetic_id", "full_name", "former_kq_department", "kq_start_year", "kq_end_year"]
                writer = csv.DictWriter(stream, fieldnames=fields)
                writer.writeheader()
                row = dict(zip(fields, ["ALUM-001", "Test Fixture", "Finance", "2000", "2010"]))
                writer.writerows([row, row])
            with self.assertRaises(ValueError):
                registry_rows(source)

    def test_remote_database_targets_are_refused(self):
        with patch("local_database.load_dotenv"), patch.dict(os.environ, {
            "DATABASE_URL": "postgresql://test:test@example.test/lumina",
        }):
            with self.assertRaises(ValueError):
                local_dsn()


    def test_only_lumina_or_named_evaluation_databases_are_local_targets(self):
        for name, allowed in (("lumina", True), ("lumina_eval_500", True), ("postgres", False), ("lumina_eval_", False),
                              ("lumina_evaluation", False), ("lumina_eval_500%3Bdrop", False)):
            with self.subTest(name), patch("local_database.load_dotenv"), patch.dict(os.environ, {
                "DATABASE_URL": f"postgresql://test:test@localhost/{name}",
            }):
                if allowed:
                    self.assertIn(name, local_dsn())
                else:
                    with self.assertRaises(ValueError):
                        local_dsn()


@unittest.skipUnless(os.getenv("LUMINA_TEST_DATABASE") == "1", "Opt in to local database tests")
class ImportDatabaseTests(unittest.TestCase):
    def test_import_is_repeatable_and_preserves_claims_and_source_values(self):
        import psycopg
        with psycopg.connect(local_dsn()) as conn:
            conn.execute("CREATE TEMP TABLE alumni_registry (LIKE public.alumni_registry INCLUDING ALL)")
            rows = registry_rows(ROOT / "data/synthetic_alumni.csv")
            self.assertEqual(import_rows(conn, rows), 200)
            owner = uuid4()
            conn.execute("UPDATE alumni_registry SET claimed_by_user_id=%s, claimed_at=now() WHERE id=%s", (owner, rows[0]["id"]))
            before = conn.execute("SELECT to_jsonb(r) FROM alumni_registry r ORDER BY id").fetchall()
            self.assertEqual(import_rows(conn, rows), 0)
            self.assertEqual(before, conn.execute("SELECT to_jsonb(r) FROM alumni_registry r ORDER BY id").fetchall())
            with self.assertRaises(ValueError), conn.transaction():
                import_rows(conn, [{**rows[0], "surname": "Different"}])
            self.assertEqual(before, conn.execute("SELECT to_jsonb(r) FROM alumni_registry r ORDER BY id").fetchall())
            conn.rollback()


class ExtendedRegistryTests(unittest.TestCase):
    def test_the_500_profile_registry_keeps_the_first_200_records_unchanged(self):
        extended = registry_rows(ROOT / "evaluation/datasets/alumni_500/synthetic_alumni_500.csv")
        with (ROOT / "data/synthetic_alumni_registry.csv").open(newline="", encoding="utf-8") as stream:
            original = list(csv.DictReader(stream))
        self.assertEqual(len(extended), 500)
        self.assertEqual([{key: str(value) for key, value in row.items()} for row in extended[:200]], original)
        self.assertEqual([row["synthetic_staff_number"] for row in extended[200:]][:2], ["SYN-ALUM-201", "SYN-ALUM-202"])
        self.assertEqual(len({row["synthetic_staff_number"] for row in extended}), 500)


if __name__ == "__main__":
    unittest.main()
