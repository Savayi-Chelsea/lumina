"""The 500-profile evaluation dataset: baseline preserved, deterministic, internally consistent."""
import csv
import re
import sys
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from generate_evaluation_dataset import build  # noqa: E402
from synthetic_expansion_500 import LEADERSHIP_SKILLS, SENIOR_KQ_ROLES  # noqa: E402


class EvaluationDatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline, cls.baseline_history, cls.rows, cls.history, cls.meta = build()
        cls.by_id = {}
        for entry in cls.history:
            cls.by_id.setdefault(entry["synthetic_id"], []).append(entry)

    def test_generation_is_deterministic(self):
        again = build()
        self.assertEqual(again[2], self.rows)
        self.assertEqual(again[3], self.history)

    def test_baseline_is_the_unchanged_demo_dataset(self):
        with (ROOT / "data/synthetic_alumni.csv").open(newline="", encoding="utf-8") as handle:
            self.assertEqual(list(csv.DictReader(handle)), self.baseline)
        written = ROOT / "evaluation/datasets/alumni_500/synthetic_alumni_500.csv"
        if written.exists():
            with written.open(newline="", encoding="utf-8") as handle:
                self.assertEqual(list(csv.DictReader(handle))[:200], self.baseline)

    def test_identities_names_and_departments(self):
        ids = [r["synthetic_id"] for r in self.baseline + self.rows]
        self.assertEqual(ids, [f"ALUM-{n:03}" for n in range(1, 501)])
        # The unchanged Sprint I rows already repeat two names; new names never repeat any name.
        new_names = [r["full_name"] for r in self.rows]
        self.assertEqual(len(new_names), len(set(new_names)))
        self.assertFalse(set(new_names) & {r["full_name"] for r in self.baseline})
        departments = Counter(r["former_kq_department"] for r in self.rows)
        self.assertEqual(len(departments), 12)
        self.assertEqual(set(departments.values()), {25})

    def test_mentor_consent_and_availability_stay_realistic(self):
        rows = self.baseline + self.rows
        consent = sum(str(r["consent_to_matching"]) == "True" for r in rows) / len(rows)
        available = sum(str(r["available_for_mentorship"]) == "True" for r in rows) / len(rows)
        self.assertTrue(0.78 <= consent <= 0.90, consent)
        self.assertTrue(0.72 <= available <= 0.86, available)

    def test_each_profile_is_internally_consistent(self):
        meta = {m["synthetic_id"]: m for m in self.meta}
        for row in self.rows:
            with self.subTest(row["synthetic_id"]):
                start, end = int(row["kq_start_year"]), int(row["kq_end_year"])
                self.assertTrue(1990 <= start < end <= 2024)
                history = self.by_id[row["synthetic_id"]]
                kq = [h for h in history if h["organization"] == "Kenya Airways"]
                self.assertEqual((kq[0]["start_year"], kq[-1]["end_year"], kq[-1]["job_title"]), (start, end, row["former_kq_role"]))
                for before, after in zip(history, history[1:]):
                    self.assertLessEqual(int(before["end_year"]), int(after["start_year"]))
                current = history[-1]
                self.assertTrue(current["is_current"])
                self.assertEqual((current["job_title"], current["organization"]), (row["current_job_title"], row["current_organization"]))
                self.assertLessEqual(int(current["start_year"]), 2025)
                level = meta[row["synthetic_id"]]["experience_level"]
                if level == "early":
                    self.assertNotIn(row["former_kq_role"], SENIOR_KQ_ROLES)
                skills = row["skills"].split("|")
                self.assertEqual(len(skills), len(set(skills)))
                if level in ("senior", "executive"):
                    self.assertTrue(set(skills) & set(LEADERSHIP_SKILLS))
                for text in (row["headline"], row["biography"]):
                    self.assertIsNone(re.search(r"[{}]", text))

    def test_the_new_profiles_are_diverse(self):
        self.assertEqual(set(Counter(m["experience_level"] for m in self.meta)), {"early", "mid", "senior", "executive"})
        self.assertEqual(set(Counter(m["move_type"] for m in self.meta)), {"aviation", "adjacent", "change"})
        self.assertGreaterEqual(len({m["career_path"] for m in self.meta}), 30)
        self.assertGreaterEqual(len({r["industry"] for r in self.rows}), 14)


if __name__ == "__main__":
    unittest.main()
