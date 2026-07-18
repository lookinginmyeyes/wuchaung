import unittest

from backend.vision import VideoTrackConfig, detect_ball


class SmallBallDetectionTests(unittest.TestCase):
    def _opencv(self):
        try:
            import cv2 as cv  # type: ignore
            import numpy as np  # type: ignore
        except Exception as error:  # pragma: no cover
            self.skipTest(f"OpenCV runtime unavailable: {error}")
        return cv, np

    def test_detects_two_pixel_radius_ball(self):
        cv, np = self._opencv()
        frame = np.full((180, 240, 3), 226, dtype=np.uint8)
        cv.circle(frame, (118, 74), 2, (18, 18, 18), -1, lineType=cv.LINE_AA)

        detection = detect_ball(frame, VideoTrackConfig(min_radius_px=1, max_radius_px=6))

        self.assertIsNotNone(detection)
        self.assertAlmostEqual(detection["x"], 118, delta=3)
        self.assertAlmostEqual(detection["y"], 74, delta=3)
        self.assertLessEqual(detection["radius"], 6)

    def test_detects_low_contrast_two_pixel_radius_ball(self):
        cv, np = self._opencv()
        frame = np.full((180, 240, 3), 196, dtype=np.uint8)
        cv.circle(frame, (92, 121), 2, (82, 82, 82), -1, lineType=cv.LINE_AA)
        ok, encoded = cv.imencode(".jpg", frame, [int(cv.IMWRITE_JPEG_QUALITY), 82])
        self.assertTrue(ok)
        decoded = cv.imdecode(encoded, cv.IMREAD_COLOR)

        detection = detect_ball(decoded, VideoTrackConfig(min_radius_px=1, max_radius_px=8))

        self.assertIsNotNone(detection)
        self.assertAlmostEqual(detection["x"], 92, delta=4)
        self.assertAlmostEqual(detection["y"], 121, delta=4)

    def test_detects_tiny_motion_blurred_ball(self):
        cv, np = self._opencv()
        frame = np.full((180, 240, 3), 218, dtype=np.uint8)
        cv.ellipse(frame, (154, 86), (2, 5), 0, 0, 360, (38, 38, 38), -1, lineType=cv.LINE_AA)
        frame = cv.GaussianBlur(frame, (3, 3), 0)

        detection = detect_ball(frame, VideoTrackConfig(min_radius_px=1, max_radius_px=10))

        self.assertIsNotNone(detection)
        self.assertAlmostEqual(detection["x"], 154, delta=5)
        self.assertAlmostEqual(detection["y"], 86, delta=6)


if __name__ == "__main__":
    unittest.main()
