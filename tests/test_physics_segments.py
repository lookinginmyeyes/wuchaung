import math
import random
import unittest

from backend.physics import find_uniform_segment


class UniformSegmentTests(unittest.TestCase):
    def test_two_stage_search_preserves_robust_plateau_choice(self):
        rng = random.Random(7)
        points = []
        for index in range(300):
            base_velocity = max(0.005, 0.02 * (1 - math.exp(-index / 22)))
            points.append(
                {
                    "t": index / 15,
                    "v": base_velocity + rng.gauss(0, 0.00035),
                    "v_segment": base_velocity + rng.gauss(0, 0.00015),
                    "confidence": 0.9,
                }
            )

        segment = find_uniform_segment(points)

        self.assertEqual((segment["start"], segment["end"]), (156, 228))
        self.assertEqual(segment["window_size"], 72)
        self.assertAlmostEqual(segment["cv"], 0.006773701379806269)
        self.assertAlmostEqual(segment["slope_penalty"], 2.422096114467468e-05)


if __name__ == "__main__":
    unittest.main()
