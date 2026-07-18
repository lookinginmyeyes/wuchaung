from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any


@dataclass
class VideoTrackConfig:
    scale_m_per_px: float | None = None
    fps: float | None = None
    roi: tuple[int, int, int, int] | None = None
    min_radius_px: int = 4
    max_radius_px: int | None = None
    frame_step: int = 1
    max_frames: int = 1200
    invert_y: bool = False
    use_norfair: bool = False
    norfair_distance_px: float = 36.0
    nonlinear_correction: bool = False
    liquid_depth_m: float | None = None
    tube_radius_m: float | None = None
    refractive_index: float = 1.47
    camera_distance_m: float | None = None
    glass_thickness_m: float | None = None
    correction_strength: float = 1.0
    calibration_tick_spacing_m: float | None = None
    axis_calibration_points: tuple[tuple[float, float], ...] | None = None
    ignore_zones: tuple[tuple[float, float, float], ...] | None = None


def build_video_track_config(payload: dict[str, Any]) -> VideoTrackConfig:
    roi_payload = payload.get("roi")
    roi = None
    if isinstance(roi_payload, dict):
        try:
            roi = (
                int(roi_payload.get("x", 0)),
                int(roi_payload.get("y", 0)),
                int(roi_payload.get("width", 0)),
                int(roi_payload.get("height", 0)),
            )
        except (TypeError, ValueError):
            roi = None
    # Also support flat query params: roi_x, roi_y, roi_w, roi_h
    if roi is None and payload.get("roi_x") is not None:
        try:
            roi = (
                int(payload["roi_x"]),
                int(payload["roi_y"]),
                int(payload.get("roi_w", 0)),
                int(payload.get("roi_h", 0)),
            )
            if roi[2] <= 0 or roi[3] <= 0:
                roi = None
        except (TypeError, ValueError):
            roi = None
    return VideoTrackConfig(
        scale_m_per_px=_optional_float(payload.get("scale_m_per_px")),
        fps=_optional_float(payload.get("fps")),
        roi=roi,
        min_radius_px=max(1, int(payload.get("min_radius_px", 4) or 4)),
        max_radius_px=_optional_radius_limit(payload.get("max_radius_px")),
        frame_step=max(1, int(payload.get("frame_step", 1) or 1)),
        max_frames=max(12, int(payload.get("max_frames", 1200) or 1200)),
        invert_y=bool(payload.get("invert_y", False)),
        use_norfair=str(payload.get("use_norfair", "")).lower() in {"1", "true", "yes", "on"},
        norfair_distance_px=float(payload.get("norfair_distance_px", 36) or 36),
        nonlinear_correction=str(payload.get("nonlinear_correction", "")).lower() in {"1", "true", "yes", "on"},
        liquid_depth_m=_optional_float(payload.get("liquid_depth_m")),
        tube_radius_m=_optional_float(payload.get("tube_radius_m")),
        refractive_index=float(payload.get("refractive_index", 1.47) or 1.47),
        camera_distance_m=_optional_float(payload.get("camera_distance_m")),
        glass_thickness_m=_optional_float(payload.get("glass_thickness_m")),
        correction_strength=float(payload.get("correction_strength", 1.0) or 1.0),
        calibration_tick_spacing_m=_optional_float(payload.get("calibration_tick_spacing_m")),
        axis_calibration_points=_parse_axis_calibration_points(payload.get("axis_calibration_points")),
        ignore_zones=_parse_ignore_zones(payload.get("ignore_zones")),
    )


def inspect_vision_runtime() -> dict[str, Any]:
    norfair = {"available": False}
    try:
        import norfair as norfair_module  # type: ignore

        norfair = {"available": True, "version": getattr(norfair_module, "__version__", "unknown")}
    except Exception as error:
        norfair = {"available": False, "error": str(error)}

    try:
        import cv2 as cv  # type: ignore
    except Exception as error:
        return {
            "available": False,
            "engine": "opencv",
            "error": str(error),
            "norfair": norfair,
            "install_hint": "python3 -m pip install opencv-python numpy norfair",
        }
    return {"available": True, "engine": "opencv", "version": cv.__version__, "norfair": norfair}


def extract_trajectory_from_video_file(path: str | Path, config: VideoTrackConfig | None = None) -> dict[str, Any]:
    runtime = inspect_vision_runtime()
    if not runtime["available"]:
        raise RuntimeError(runtime["install_hint"])

    import cv2 as cv  # type: ignore

    cfg = config or VideoTrackConfig()
    capture = cv.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError("video file cannot be opened by OpenCV")

    source_fps = cfg.fps or capture.get(cv.CAP_PROP_FPS) or 0
    fps = float(source_fps) if source_fps and math.isfinite(source_fps) and source_fps > 0 else 30.0
    width = int(capture.get(cv.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv.CAP_PROP_FRAME_HEIGHT) or 0)
    norfair_tracker = build_norfair_tracker(cfg) if cfg.use_norfair else None
    correction_meta: dict[str, Any] = {"enabled": cfg.nonlinear_correction, "model": "linear_scale"}

    trajectory = []
    frame_index = -1
    processed = 0
    misses = 0
    while processed < cfg.max_frames:
        ok, frame = capture.read()
        if not ok:
            break
        frame_index += 1
        if frame_index % cfg.frame_step != 0:
            continue

        roi_frame, offset = crop_roi(frame, cfg.roi)
        detection = detect_ball(roi_frame, cfg)
        processed += 1
        if detection is None:
            misses += 1
            continue

        tracked = update_norfair_tracking(norfair_tracker, detection)
        x_px = tracked["x"] + offset[0]
        y_px = tracked["y"] + offset[1]
        y_for_output = (height - y_px) if cfg.invert_y and height > 0 else y_px
        scale = cfg.scale_m_per_px or 1.0
        y_linear = y_for_output * scale
        y_norm = (y_px / height) if height else None
        y_corrected, correction_meta = correct_axis_position(y_linear, height * scale if height else None, cfg, y_norm=y_norm)
        trajectory.append(
            {
                "frame": frame_index,
                "t": round(frame_index / fps, 6),
                "x_px": round(x_px, 3),
                "y_px": round(y_px, 3),
                "x": round(x_px / max(1, width), 6) if width else 0.5,
                "y": round(y_corrected, 8),
                "measured_y": round(y_linear, 8),
                "corrected_y": round(y_corrected, 8),
                "nonlinear_delta": round(y_corrected - y_linear, 8),
                "confidence": round(min(1.0, detection["confidence"] * tracked["confidence"]), 4),
                "radius_px": round(detection["radius"], 3),
                "method": detection["method"] if tracked["method"] == "raw_detection" else f"{detection['method']}+norfair",
            }
        )

    capture.release()
    return {
        "trajectory": trajectory,
        "metadata": {
            "fps": fps,
            "width": width,
            "height": height,
            "processed_frames": processed,
            "detected_frames": len(trajectory),
            "missed_frames": misses,
            "scale_m_per_px": cfg.scale_m_per_px,
            "roi": cfg.roi,
            "tracking_layer": "norfair" if norfair_tracker is not None else "raw_detection",
            "nonlinear_correction": correction_meta,
        },
    }


def extract_trajectory_from_video_bytes(video_bytes: bytes, suffix: str = ".mp4", config: VideoTrackConfig | None = None) -> dict[str, Any]:
    with NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(video_bytes)
        tmp.flush()
        return extract_trajectory_from_video_file(tmp.name, config=config)


def detect_ball_from_image_bytes(
    image_bytes: bytes,
    config: VideoTrackConfig | None = None,
    frame_index: int = 0,
    timestamp: float | None = None,
) -> dict[str, Any]:
    runtime = inspect_vision_runtime()
    if not runtime["available"]:
        raise RuntimeError(runtime["install_hint"])

    import cv2 as cv  # type: ignore
    import numpy as np  # type: ignore

    cfg = config or VideoTrackConfig()
    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv.imdecode(image_array, cv.IMREAD_COLOR)
    if frame is None:
        raise ValueError("image frame cannot be decoded by OpenCV")

    height, width = frame.shape[:2]
    roi_frame, offset = crop_roi(frame, cfg.roi)
    detection = detect_ball(roi_frame, cfg)
    if detection is None:
        return {
            "detected": False,
            "frame": frame_index,
            "t": timestamp,
            "metadata": {"width": width, "height": height, "roi": cfg.roi},
        }

    x_px = float(detection["x"]) + offset[0]
    y_px = float(detection["y"]) + offset[1]
    y_for_output = (height - y_px) if cfg.invert_y and height > 0 else y_px
    scale = cfg.scale_m_per_px or 1.0
    y_linear = y_for_output * scale
    y_norm = (y_px / height) if height else None
    y_corrected, correction_meta = correct_axis_position(y_linear, height * scale if height else None, cfg, y_norm=y_norm)
    return {
        "detected": True,
        "frame": frame_index,
        "t": timestamp,
        "x_px": round(x_px, 3),
        "y_px": round(y_px, 3),
        "x": round(x_px / max(1, width), 6) if width else 0.5,
        "y": round(y_corrected, 8),
        "measured_y": round(y_linear, 8),
        "corrected_y": round(y_corrected, 8),
        "nonlinear_delta": round(y_corrected - y_linear, 8),
        "confidence": round(float(detection["confidence"]), 4),
        "radius_px": round(float(detection["radius"]), 3),
        "method": str(detection["method"]),
        "metadata": {
            "width": width,
            "height": height,
            "scale_m_per_px": cfg.scale_m_per_px,
            "roi": cfg.roi,
            "nonlinear_correction": correction_meta,
        },
    }


def correct_axis_position(
    y_linear: float,
    frame_span_m: float | None,
    config: VideoTrackConfig,
    y_norm: float | None = None,
) -> tuple[float, dict[str, Any]]:
    if not config.nonlinear_correction:
        return y_linear, {"enabled": False, "model": "linear_scale"}

    mapped, model_meta = map_axis_calibration(y_norm, config.axis_calibration_points)
    if mapped is not None:
        points = config.axis_calibration_points or ()
        return mapped, {
            "enabled": True,
            **model_meta,
            "point_count": len(points),
            "y_norm_span": [round(points[0][0], 6), round(points[-1][0], 6)] if points else None,
            "real_span_m": [round(points[0][1], 6), round(points[-1][1], 6)] if points else None,
            "note": "由标定棒多点点击直接拟合 Y_real=f(y_pixel)；折射、透视和残余畸变由实测映射吸收。",
        }

    return y_linear, {
        "enabled": False,
        "model": "linear_scale",
        "reason": "missing_axis_calibration_points",
        "note": "未收到标定棒多点映射时不使用折射率、壁厚、相机距离等估计参数，避免伪修正。",
    }


def map_axis_calibration(
    y_norm: float | None,
    points: tuple[tuple[float, float], ...] | None,
) -> tuple[float | None, dict[str, Any]]:
    mapped = interpolate_axis_calibration(y_norm, points)
    if mapped is None:
        return None, {"model": "linear_scale"}
    return mapped, {"model": "calibration_rod_piecewise_linear", "mode": "piecewise"}


def interpolate_axis_calibration(y_norm: float | None, points: tuple[tuple[float, float], ...] | None) -> float | None:
    if y_norm is None or not points or len(points) < 2:
        return None
    if not math.isfinite(y_norm):
        return None

    y = float(y_norm)
    ordered = sorted(points, key=lambda item: item[0])
    if y <= ordered[0][0]:
        left, right = ordered[0], ordered[1]
    elif y >= ordered[-1][0]:
        left, right = ordered[-2], ordered[-1]
    else:
        left, right = ordered[0], ordered[-1]
        for index in range(len(ordered) - 1):
            candidate_left = ordered[index]
            candidate_right = ordered[index + 1]
            if candidate_left[0] <= y <= candidate_right[0]:
                left, right = candidate_left, candidate_right
                break

    dy = right[0] - left[0]
    if abs(dy) < 1e-9:
        return left[1]
    ratio = (y - left[0]) / dy
    return left[1] + ratio * (right[1] - left[1])


def crop_roi(frame, roi):
    if not roi:
        return frame, (0, 0)
    x, y, width, height = roi
    if width <= 0 or height <= 0:
        return frame, (0, 0)
    frame_h, frame_w = frame.shape[:2]
    x0 = max(0, min(frame_w - 1, x))
    y0 = max(0, min(frame_h - 1, y))
    x1 = max(x0 + 1, min(frame_w, x0 + width))
    y1 = max(y0 + 1, min(frame_h, y0 + height))
    return frame[y0:y1, x0:x1], (x0, y0)


def detect_ball(frame, config: VideoTrackConfig) -> dict[str, float | str] | None:
    import cv2 as cv  # type: ignore
    import numpy as np  # type: ignore

    frame_h, frame_w = frame.shape[:2]
    min_radius = max(1, config.min_radius_px)
    small_ball_mode = min_radius <= 2
    gray = cv.cvtColor(frame, cv.COLOR_BGR2GRAY)
    gray = cv.medianBlur(gray, 3 if small_ball_mode else 5)
    enhanced = cv.createCLAHE(
        clipLimit=2.7 if small_ball_mode else 2.2,
        tileGridSize=(6, 6) if small_ball_mode else (8, 8),
    ).apply(gray)
    hough_sources = ((gray, "hough_circle"), (enhanced, "hough_circle_enhanced"))
    hough_trials = ((90, 28, 0.88), (70, 18, 0.78), (55, 14, 0.68))
    if small_ball_mode:
        hough_trials = (*hough_trials, (45, 10, 0.6), (35, 8, 0.54), (25, 5, 0.46))
    dark_score_floor = 0.18 if small_ball_mode else 0.26
    for source, method in hough_sources:
        for param1, param2, confidence in hough_trials:
            hough = cv.HoughCircles(
                source,
                cv.HOUGH_GRADIENT,
                dp=1.1 if small_ball_mode else 1.2,
                minDist=max(3 if small_ball_mode else 5, min_radius * 2),
                param1=param1,
                param2=param2,
                minRadius=min_radius,
                maxRadius=config.max_radius_px or 0,
            )
            if hough is not None and len(hough[0]) > 0:
                valid_circles = []
                for item in hough[0]:
                    x, y, radius = float(item[0]), float(item[1]), float(item[2])
                    if _is_ignored_detection(x, y, frame_w, frame_h, config):
                        continue
                    dark_score = _dark_blob_score(gray, x, y, radius)
                    if dark_score >= dark_score_floor:
                        valid_circles.append((dark_score, radius, item))
                if not valid_circles:
                    continue
                _, _, circle = sorted(valid_circles, key=lambda item: (item[0], -item[1]), reverse=True)[0]
                return {
                    "x": float(circle[0]),
                    "y": float(circle[1]),
                    "radius": float(circle[2]),
                    "confidence": confidence,
                    "method": method,
                }

    dark_cutoff = int(np.percentile(gray, 42))
    enhanced_cutoff = int(np.percentile(enhanced, 42))
    _, otsu_binary = cv.threshold(gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
    if otsu_binary.mean() > 127:
        otsu_binary = cv.bitwise_not(otsu_binary)
    _, enhanced_otsu = cv.threshold(enhanced, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
    if enhanced_otsu.mean() > 127:
        enhanced_otsu = cv.bitwise_not(enhanced_otsu)
    _, dark_binary = cv.threshold(gray, min(245, dark_cutoff + 12), 255, cv.THRESH_BINARY_INV)
    _, enhanced_dark = cv.threshold(enhanced, min(245, enhanced_cutoff + 10), 255, cv.THRESH_BINARY_INV)
    adaptive_binary = cv.adaptiveThreshold(
        enhanced,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        15 if small_ball_mode else 21,
        2 if small_ball_mode else 3,
    )
    binary = cv.bitwise_or(otsu_binary, dark_binary)
    binary = cv.bitwise_or(binary, enhanced_otsu)
    binary = cv.bitwise_or(binary, enhanced_dark)
    adaptive_foreground_ratio = float(np.count_nonzero(adaptive_binary)) / max(1, adaptive_binary.size)
    if 0.00005 <= adaptive_foreground_ratio <= (0.22 if small_ball_mode else 0.42):
        binary = cv.bitwise_or(binary, adaptive_binary)
    kernel_size = 2 if small_ball_mode else 3
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, (kernel_size, kernel_size))
    if not small_ball_mode:
        binary = cv.morphologyEx(binary, cv.MORPH_OPEN, kernel)
    binary = cv.morphologyEx(binary, cv.MORPH_CLOSE, kernel)
    contours, _ = cv.findContours(binary, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    candidates = []
    min_area = max(1.0 if small_ball_mode else 2.0, math.pi * min_radius * min_radius * (0.2 if small_ball_mode else 0.3))
    for contour in contours:
        area = cv.contourArea(contour)
        if area < min_area:
            continue
        (x, y), radius = cv.minEnclosingCircle(contour)
        if radius < min_radius * (0.55 if small_ball_mode else 0.75):
            continue
        if _is_ignored_detection(float(x), float(y), frame_w, frame_h, config):
            continue
        if config.max_radius_px is not None and radius > config.max_radius_px:
            continue

        # --- Reject non-circular shapes (e.g. refraction lines) ---
        bx, by, bw, bh = cv.boundingRect(contour)
        aspect = max(bw, bh) / max(min(bw, bh), 1)
        if aspect > (4.6 if small_ball_mode else 3.2):
            # A ball is roughly round; a refraction line is tall and thin.
            # A large aspect ratio means one side is far longer than the other.
            continue

        circle_area = math.pi * radius * radius
        fill_ratio = area / max(1.0, circle_area)
        if fill_ratio < (0.16 if small_ball_mode else 0.24):
            continue
        compactness = min(1.0, (4 * math.pi * area) / max(1.0, cv.arcLength(contour, True) ** 2))
        dark_score = _dark_blob_score(gray, float(x), float(y), float(radius))
        if small_ball_mode and dark_score < 0.08:
            continue
        score = fill_ratio * 0.55 + compactness * 0.3 + dark_score * 0.15
        candidates.append((score, fill_ratio, area, x, y, radius))
    if not candidates:
        return None
    # Prefer the most circular candidate (highest fill_ratio), not just the largest
    _, fill_ratio, area, x, y, radius = sorted(candidates, key=lambda item: item[0], reverse=True)[0]
    confidence = max(0.35, min(0.78, 0.45 + fill_ratio * 0.35))
    return {"x": float(x), "y": float(y), "radius": float(radius), "confidence": confidence, "method": "contour_fallback"}


def _is_ignored_detection(x_px: float, y_px: float, width: int, height: int, config: VideoTrackConfig) -> bool:
    if not config.ignore_zones or width <= 0 or height <= 0:
        return False
    x_norm = x_px / width
    y_norm = y_px / height
    for zone_x, zone_y, zone_r in config.ignore_zones:
        if math.hypot(x_norm - zone_x, y_norm - zone_y) <= zone_r:
            return True
    return False


def _dark_blob_score(gray, x_px: float, y_px: float, radius_px: float) -> float:
    import cv2 as cv  # type: ignore
    import numpy as np  # type: ignore

    height, width = gray.shape[:2]
    radius = max(2.0, float(radius_px))
    x0 = max(0, int(x_px - radius * 2.2))
    y0 = max(0, int(y_px - radius * 2.2))
    x1 = min(width, int(x_px + radius * 2.2) + 1)
    y1 = min(height, int(y_px + radius * 2.2) + 1)
    if x1 <= x0 or y1 <= y0:
        return 0.0

    crop = gray[y0:y1, x0:x1]
    yy, xx = np.ogrid[y0:y1, x0:x1]
    dist = np.sqrt((xx - x_px) ** 2 + (yy - y_px) ** 2)
    inner = dist <= radius * 0.78
    ring = (dist >= radius * 1.2) & (dist <= radius * 2.0)
    if not inner.any():
        return 0.0

    local_reference = float(np.median(crop[ring])) if ring.any() else float(np.median(crop))
    dark_threshold = local_reference - 8.0
    dark_fraction = float(np.mean(crop[inner] < dark_threshold))
    inner_mean = float(np.mean(crop[inner]))
    contrast = max(0.0, min(1.0, (local_reference - inner_mean) / 38.0))
    return max(dark_fraction, 0.55 * dark_fraction + 0.45 * contrast)


def build_norfair_tracker(config: VideoTrackConfig):
    try:
        from norfair import Tracker  # type: ignore
    except Exception as error:
        raise RuntimeError(f"Norfair未安装，先执行 python3 -m pip install norfair；错误：{error}") from error

    def distance(detection, tracked_object):
        estimate = tracked_object.estimate
        point = detection.points[0]
        return float(((estimate[0][0] - point[0]) ** 2 + (estimate[0][1] - point[1]) ** 2) ** 0.5)

    return Tracker(distance_function=distance, distance_threshold=config.norfair_distance_px)


def update_norfair_tracking(tracker, detection: dict[str, float | str]) -> dict[str, float | str]:
    if tracker is None:
        return {"x": float(detection["x"]), "y": float(detection["y"]), "confidence": 1.0, "method": "raw_detection"}
    try:
        import numpy as np  # type: ignore
        from norfair import Detection  # type: ignore
    except Exception as error:
        raise RuntimeError(f"Norfair依赖不可用：{error}") from error

    points = np.array([[float(detection["x"]), float(detection["y"])]])
    tracked_objects = tracker.update(detections=[Detection(points=points)])
    if not tracked_objects:
        return {"x": float(detection["x"]), "y": float(detection["y"]), "confidence": 0.7, "method": "raw_detection"}
    selected = min(
        tracked_objects,
        key=lambda item: ((item.estimate[0][0] - points[0][0]) ** 2 + (item.estimate[0][1] - points[0][1]) ** 2) ** 0.5,
    )
    return {"x": float(selected.estimate[0][0]), "y": float(selected.estimate[0][1]), "confidence": 0.96, "method": "norfair"}


def _optional_float(value) -> float | None:
    if value in (None, ""):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _optional_radius_limit(value) -> int | None:
    parsed = _optional_float(value)
    if parsed is None or parsed <= 0:
        return None
    return max(2, int(parsed))


def _parse_axis_calibration_points(value) -> tuple[tuple[float, float], ...] | None:
    if value in (None, ""):
        return None
    try:
        raw_points = json.loads(value) if isinstance(value, str) else value
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(raw_points, list):
        return None

    points: list[tuple[float, float]] = []
    for item in raw_points:
        if not isinstance(item, dict):
            continue
        y_norm = _optional_float(item.get("y_norm"))
        real_m = _optional_float(item.get("real_m"))
        if y_norm is None or real_m is None:
            continue
        if 0 <= y_norm <= 1:
            points.append((float(y_norm), float(real_m)))
    points = sorted(set(points), key=lambda pair: pair[0])
    if len(points) < 2:
        return None
    return tuple(points)


def _parse_ignore_zones(value) -> tuple[tuple[float, float, float], ...] | None:
    if value in (None, ""):
        return None
    try:
        raw_zones = json.loads(value) if isinstance(value, str) else value
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(raw_zones, list):
        return None

    zones: list[tuple[float, float, float]] = []
    for item in raw_zones[:12]:
        if not isinstance(item, dict):
            continue
        x_norm = _optional_float(item.get("x"))
        y_norm = _optional_float(item.get("y"))
        radius_norm = _optional_float(item.get("r"))
        if x_norm is None or y_norm is None or radius_norm is None:
            continue
        if 0 <= x_norm <= 1 and 0 <= y_norm <= 1:
            zones.append((float(x_norm), float(y_norm), max(0.004, min(0.08, float(radius_norm)))))
    return tuple(zones) if zones else None
