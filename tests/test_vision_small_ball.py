import unittest

from backend.vision import VideoTrackConfig, detect_ball


class SmallBallDetectionTests(unittest.TestCase):
    def test_detects_two_pixel_radius_ball(self):
        try:
            import cv2 as cv  # type: ignore
            import numpy as np  # type: ignore
        except Exception as error:  # pragma: no cover
            self.skipTest(f"OpenCV runtime unavailable: {error}")

        frame = np.full((180, 240, 3), 226, dtype=np.uint8)
        cv.circle(frame, (118, 74), 2, (18, 18, 18), -1, lineType=cv.LINE_AA)

        detection = detect_ball(frame, VideoTrackConfig(min_radius_px=1, max_radius_px=6))

        self.assertIsNotNone(detection)
        self.assertAlmostEqual(detection["x"], 118, delta=3)
        self.assertAlmostEqual(detection["y"], 74, delta=3)
        self.assertLessEqual(detection["radius"], 6)


if __name__ == "__main__":
    unittest.main()
