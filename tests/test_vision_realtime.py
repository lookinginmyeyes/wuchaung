import unittest

from backend.vision import VideoTrackConfig, build_video_track_config, detect_ball_from_image_bytes


class RealtimeVisionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            import cv2  # noqa: F401
            import numpy  # noqa: F401
        except ImportError as error:
            raise unittest.SkipTest(str(error)) from error

    def test_realtime_mode_is_parsed(self):
        config = build_video_track_config({"detection_mode": "realtime"})
        self.assertTrue(config.realtime_mode)

    def test_realtime_detector_finds_dark_ball(self):
        import cv2 as cv
        import numpy as np

        frame = np.full((405, 720, 3), 235, dtype=np.uint8)
        cv.line(frame, (210, 10), (210, 395), (175, 175, 175), 2)
        cv.line(frame, (510, 10), (510, 395), (175, 175, 175), 2)
        cv.circle(frame, (362, 218), 14, (24, 24, 24), -1)
        ok, encoded = cv.imencode(".jpg", frame, [cv.IMWRITE_JPEG_QUALITY, 72])
        self.assertTrue(ok)

        result = detect_ball_from_image_bytes(
            encoded.tobytes(),
            config=VideoTrackConfig(min_radius_px=4, max_radius_px=120, realtime_mode=True),
            frame_index=7,
            timestamp=0.5,
        )

        self.assertTrue(result["detected"])
        self.assertAlmostEqual(result["x_px"], 362, delta=3)
        self.assertAlmostEqual(result["y_px"], 218, delta=3)
        self.assertEqual(result["frame"], 7)
        self.assertIn(result["method"], {"realtime_hough", "realtime_contour"})

    def test_realtime_contour_rejects_small_noise(self):
        import cv2 as cv
        import numpy as np

        rng = np.random.default_rng(7)
        base = np.linspace(70, 210, 720, dtype=np.uint8)[None, :]
        gray = np.repeat(base, 405, axis=0)
        gray = np.clip(gray + rng.normal(0, 13, gray.shape), 0, 255).astype(np.uint8)
        frame = cv.cvtColor(gray, cv.COLOR_GRAY2BGR)
        ok, encoded = cv.imencode(".jpg", frame, [cv.IMWRITE_JPEG_QUALITY, 72])
        self.assertTrue(ok)

        result = detect_ball_from_image_bytes(
            encoded.tobytes(),
            config=VideoTrackConfig(min_radius_px=4, max_radius_px=120, realtime_mode=True),
        )

        self.assertFalse(result["detected"])


if __name__ == "__main__":
    unittest.main()
