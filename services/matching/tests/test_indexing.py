import unittest

from services.matching.app.indexing import source_hash, source_text


class SourceTests(unittest.TestCase):
    def test_order_whitespace_unicode_and_excluded_fields(self):
        first = dict(headline="Cloud   engineer", biography="Cafe\u0301 expertise",
                     skills=["Python", "AWS"], mentorship_topics="DevOps|Cloud",
                     experience=[{"job_title": "Engineer"}, {"job_title": "Analyst"}],
                     full_name="PRIVATE NAME", email="private@example.com", id="private-id")
        second = {**first, "headline": "Cloud engineer", "biography": "Caf\u00e9 expertise",
                  "skills": ["AWS", "Python", "AWS"], "mentorship_topics": "Cloud|DevOps",
                  "experience": list(reversed(first["experience"])), "full_name": "Other"}
        self.assertEqual(source_text(first), source_text(second))
        self.assertEqual(source_hash(source_text(first)), source_hash(source_text(second)))
        self.assertNotIn("PRIVATE", source_text(first))
        self.assertNotIn("private", source_text(first))

    def test_each_source_component_changes_hash(self):
        base = dict(headline="Engineer", biography="Cloud", skills=["AWS"],
                    experience=[{"job_title": "Engineer"}], mentorship_topics="DevOps")
        digest = source_hash(source_text(base))
        for field, value in (("headline", "Architect"), ("biography", "Security"),
                             ("skills", ["Docker"]), ("experience", [{"job_title": "Lead"}]),
                             ("mentorship_topics", "Leadership")):
            with self.subTest(field=field):
                self.assertNotEqual(digest, source_hash(source_text({**base, field: value})))

    def test_personal_metadata_alone_is_empty(self):
        self.assertEqual(source_text(dict(full_name="Name", email="a@b", id="123")), "")


if __name__ == "__main__":
    unittest.main()
