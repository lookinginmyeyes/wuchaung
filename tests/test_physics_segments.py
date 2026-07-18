import math
import random
import unittest

from backend.physics import MeasurementParams, analyze_trajectory, find_uniform_segment


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

    def test_measurement_curves_start_at_first_detection_time(self):
        trajectory = [
            {
                "t": 5.0 + index * 0.04,
                "y": index * 0.0008,
                "x": 0.5,
                "confidence": 0.92,
            }
            for index in range(40)
        ]

        run = analyze_trajectory(MeasurementParams(), trajectory, student={})

        self.assertEqual(run["curves"]["position"][0]["t"], 0.0)
        self.assertAlmostEqual(run["curves"]["velocity"][0]["t"], 0.04)
        self.assertAlmostEqual(run["frames"][0]["t"], 0.0)


if __name__ == "__main__":
    unittest.main()
