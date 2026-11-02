"""Generated avatars, cover art and the seeded connection network are deterministic and well-formed."""
import io
import random
import sys
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from generate_avatars import FEMININE, MASCULINE, portrait, presentation
from generate_cover_art import coast, dawn, horizon, night, savanna
from seed_connections import build_network, pick_target


class AvatarTests(unittest.TestCase):
    def test_portraits_are_deterministic_pngs_within_the_upload_limit(self):
        first = portrait("ALUM-001", "Esther")
        self.assertEqual(first, portrait("ALUM-001", "Esther"))
        self.assertNotEqual(first, portrait("ALUM-002", "Esther"))
        self.assertTrue(first.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertLess(len(first), 524288)
        self.assertEqual(Image.open(io.BytesIO(first)).size, (400, 400))

    def test_name_presentation_is_explicit_and_ambiguous_names_are_neutral(self):
        self.assertFalse(FEMININE & MASCULINE)
        self.assertEqual(presentation("Grace"), "f")
        self.assertEqual(presentation("Brian"), "m")
        self.assertEqual(presentation("Terry"), "n")


class CoverArtTests(unittest.TestCase):
    def test_covers_are_bottom_anchored_svgs_and_deterministic(self):
        for build in (horizon, savanna, coast, night, dawn):
            svg = build()
            self.assertTrue(svg.startswith('<svg xmlns="http://www.w3.org/2000/svg"'))
            self.assertIn('preserveAspectRatio="xMidYMax slice"', svg)
            self.assertNotIn("<script", svg)
            self.assertEqual(svg, build())


class NetworkTests(unittest.TestCase):
    def test_network_has_no_self_or_duplicate_links_and_bounded_degrees(self):
        people = [(f"user-{i:03d}", f"Dept {i % 6}", f"Industry {i % 5}", f"City {i % 4}") for i in range(200)]
        edges = build_network(people, random.Random(7))
        self.assertTrue(all(a < b for a, b in edges))
        degree = {p[0]: 0 for p in people}
        for a, b in edges:
            degree[a] += 1
            degree[b] += 1
        self.assertGreaterEqual(min(degree.values()), 4)
        self.assertLessEqual(max(degree.values()), 90)
        self.assertEqual(edges, build_network(people, random.Random(7)))
        same_department = sum(1 for a, b in edges if int(a[-3:]) % 6 == int(b[-3:]) % 6)
        self.assertGreater(same_department / len(edges), 0.4)

    def test_target_degrees_are_clamped(self):
        rng = random.Random(1)
        targets = [pick_target(rng) for _ in range(2000)]
        self.assertGreaterEqual(min(targets), 4)
        self.assertLessEqual(max(targets), 60)


if __name__ == "__main__":
    unittest.main()
