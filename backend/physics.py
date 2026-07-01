import json
import math
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from statistics import mean, pstdev


G = 9.80665


# Standard table values at the listed temperature. Dynamic viscosity is strongly temperature-dependent.
SIMULATION_LIQUID_PRESETS = {
    "standard": {
        "liquid": "纯甘油 25℃",
        "rho_liquid": 1261.0,
        "eta_reference": 0.945,
        "temperature_c": 25.0,
        "disturbance_extra": 0.0,
        "damping_extra": 0.0,
        "stability_delta": 0.0,
    },
    "wall": {
        "liquid": "纯甘油 20℃",
        "rho_liquid": 1263.0,
        "eta_reference": 1.412,
        "temperature_c": 20.0,
        "disturbance_extra": 0.0,
        "damping_extra": 0.0,
        "stability_delta": 0.0,
    },
    "glare": {
        "liquid": "500 cSt 硅油 25℃",
        "rho_liquid": 970.0,
        "eta_reference": 0.485,
        "temperature_c": 25.0,
        "disturbance_extra": 0.0,
        "damping_extra": 0.0,
        "stability_delta": 0.0,
    },
    "propylene_glycol_25": {
        "liquid": "丙二醇 25℃",
        "rho_liquid": 1036.0,
        "eta_reference": 0.0486,
        "temperature_c": 25.0,
        "disturbance_extra": 0.0,
        "damping_extra": 0.0,
        "stability_delta": 0.0,
    },
    "ethylene_glycol_20": {
        "liquid": "乙二醇 20℃",
        "rho_liquid": 1113.0,
        "eta_reference": 0.0198,
        "temperature_c": 20.0,
        "disturbance_extra": 0.0,
        "damping_extra": 0.0,
        "stability_delta": 0.0,
    },
    "ethanol_20": {
        "liquid": "无水乙醇 20℃",
        "rho_liquid": 789.0,
        "eta_reference": 0.00120,
        "temperature_c": 20.0,
        "disturbance_extra": 0.0,
        "damping_extra": 0.0,
        "stability_delta": 0.0,
    },
    "methanol_25": {
        "liquid": "甲醇 25℃",
        "rho_liquid": 787.0,
        "eta_reference": 0.000543,
        "temperature_c": 25.0,
        "disturbance_extra": 0.0,
        "damping_extra": 0.0,
        "stability_delta": 0.0,
    },
    "water_20": {
        "liquid": "纯水 20℃",
        "rho_liquid": 998.2,
        "eta_reference": 0.0010016,
        "temperature_c": 20.0,
        "disturbance_extra": 0.0,
        "damping_extra": 0.0,
        "stability_delta": 0.0,
    },
}


@dataclass
class MeasurementParams:
    liquid: str = "纯甘油 25℃"
    rho_liquid: float = 1261.0
    eta_reference: float = 0.945
    radius_mm: float = 1.5
    rho_ball: float = 7850.0
    tube_diameter_mm: float = 35.0
    liquid_depth_mm: float = 220.0
    noise_level: float = 0.18
    refraction_level: float = 0.32
    temperature_c: float = 25.0


def build_params(payload: dict) -> MeasurementParams:
    return MeasurementParams(
        liquid=str(payload.get("liquid", "纯甘油 25℃")),
        rho_liquid=float(payload.get("rho_liquid", 1261.0)),
        eta_reference=float(payload.get("eta_reference", 0.945)),
        radius_mm=float(payload.get("radius_mm", 1.5)),
        rho_ball=float(payload.get("rho_ball", 7850.0)),
        tube_diameter_mm=float(payload.get("tube_diameter_mm", 35.0)),
        liquid_depth_mm=float(payload.get("liquid_depth_mm", 220.0)),
        noise_level=float(payload.get("noise_level", 0.18)),
        refraction_level=float(payload.get("refraction_level", 0.32)),
        temperature_c=float(payload.get("temperature_c", 25.0)),
    )


def correction_factors(
    radius_m: float,
    tube_radius_m: float,
    liquid_depth_m: float,
    rho_liquid: float,
    terminal_velocity: float,
    viscosity: float,
) -> dict:
    safe_tube_radius = max(tube_radius_m, radius_m * 1.04, 1e-6)
    safe_depth = max(liquid_depth_m, radius_m * 4.0, 1e-6)
    safe_viscosity = max(viscosity, 1e-9)
    re = rho_liquid * terminal_velocity * 2 * radius_m / safe_viscosity
    wall_correction = (1 + 2.4 * radius_m / safe_tube_radius) * (1 + 3.3 * radius_m / safe_depth)
    reynolds_in_range = re <= 1.0
    reynolds_correction = max(1.0, 1 + 3 * re / 16 - 19 * re * re / 1080) if reynolds_in_range else 1.0
    return {
        "re": re,
        "wall_correction": wall_correction,
        "reynolds_correction": reynolds_correction,
        "correction_total": wall_correction * reynolds_correction,
        "reynolds_correction_applied": reynolds_in_range,
    }


def viscosity_from_terminal_velocity(params: MeasurementParams, terminal_velocity: float, iterations: int = 8) -> dict:
    radius_m = params.radius_mm / 1000
    tube_radius_m = params.tube_diameter_mm / 2000
    liquid_depth_m = params.liquid_depth_mm / 1000
    base = 2 * radius_m * radius_m * (params.rho_ball - params.rho_liquid) * G / (9 * max(terminal_velocity, 1e-9))
    wall_factors = correction_factors(radius_m, tube_radius_m, liquid_depth_m, params.rho_liquid, terminal_velocity, base)
    viscosity = max(base / wall_factors["wall_correction"], 1e-9)
    factors = correction_factors(radius_m, tube_radius_m, liquid_depth_m, params.rho_liquid, terminal_velocity, viscosity)
    if not factors["reynolds_correction_applied"]:
        return {"viscosity": viscosity, "ideal_viscosity": base, **factors}
    for _ in range(iterations):
        factors = correction_factors(radius_m, tube_radius_m, liquid_depth_m, params.rho_liquid, terminal_velocity, viscosity)
        if not factors["reynolds_correction_applied"]:
            factors["reynolds_correction"] = 1.0
            factors["correction_total"] = factors["wall_correction"]
            viscosity = max(base / factors["wall_correction"], 1e-9)
            break
        next_viscosity = max(base / factors["correction_total"], 1e-9)
        if abs(next_viscosity - viscosity) / max(viscosity, 1e-9) < 1e-6:
            viscosity = next_viscosity
            break
        viscosity = 0.55 * viscosity + 0.45 * next_viscosity
    factors = correction_factors(radius_m, tube_radius_m, liquid_depth_m, params.rho_liquid, terminal_velocity, viscosity)
    if not factors["reynolds_correction_applied"]:
        factors["reynolds_correction"] = 1.0
        factors["correction_total"] = factors["wall_correction"]
        viscosity = max(base / factors["wall_correction"], 1e-9)
        factors = correction_factors(radius_m, tube_radius_m, liquid_depth_m, params.rho_liquid, terminal_velocity, viscosity)
        factors["reynolds_correction"] = 1.0
        factors["correction_total"] = factors["wall_correction"]
    return {"viscosity": viscosity, "ideal_viscosity": base, **factors}


def terminal_velocity_from_viscosity(params: MeasurementParams, viscosity: float, iterations: int = 10) -> dict:
    radius_m = params.radius_mm / 1000
    tube_radius_m = params.tube_diameter_mm / 2000
    liquid_depth_m = params.liquid_depth_mm / 1000
    numerator = 2 * radius_m * radius_m * (params.rho_ball - params.rho_liquid) * G
    terminal_velocity = numerator / (9 * max(viscosity, 1e-9))
    factors = correction_factors(radius_m, tube_radius_m, liquid_depth_m, params.rho_liquid, terminal_velocity, viscosity)
    for _ in range(iterations):
        factors = correction_factors(radius_m, tube_radius_m, liquid_depth_m, params.rho_liquid, terminal_velocity, viscosity)
        terminal_velocity = numerator / (9 * max(viscosity, 1e-9) * factors["correction_total"])
    factors = correction_factors(radius_m, tube_radius_m, liquid_depth_m, params.rho_liquid, terminal_velocity, viscosity)
    return {"terminal_velocity": terminal_velocity, **factors}


def moving_average(values: list[float], radius: int) -> list[float]:
    averaged = []
    for index in range(len(values)):
        start = max(0, index - radius)
        end = min(len(values), index + radius + 1)
        averaged.append(sum(values[start:end]) / max(1, end - start))
    return averaged


def median(values: list[float]) -> float:
    ordered = sorted(values)
    n = len(ordered)
    if n == 0:
        return 0.0
    mid = n // 2
    return ordered[mid] if n % 2 else (ordered[mid - 1] + ordered[mid]) / 2


def median_filter(values: list[float], radius: int) -> list[float]:
    filtered = []
    for index in range(len(values)):
        start = max(0, index - radius)
        end = min(len(values), index + radius + 1)
        filtered.append(median(values[start:end]))
    return filtered


def robust_sigma(values: list[float]) -> float:
    if not values:
        return 0.0
    center = median(values)
    mad = median([abs(value - center) for value in values])
    if mad > 0:
        return 1.4826 * mad
    return pstdev(values) if len(values) > 1 else 0.0


def finite_float(value, fallback: float | None = None) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if math.isfinite(parsed) else fallback


def linear_fit(points: list[dict]) -> dict:
    return weighted_linear_fit(points)


def weighted_linear_fit(points: list[dict]) -> dict:
    if not points:
        return {"slope": 0.0, "intercept": 0.0, "r2": 0.0, "rmse": 0.0, "slope_stderr": None}
    n = len(points)
    weights = [max(0.001, float(point.get("weight", 1.0))) for point in points]
    sw = sum(weights)
    sx = sum(weight * point["x"] for point, weight in zip(points, weights))
    sy = sum(weight * point["y"] for point, weight in zip(points, weights))
    x_mean = sx / max(0.001, sw)
    y_mean = sy / max(0.001, sw)
    sxx = sum(weight * (point["x"] - x_mean) ** 2 for point, weight in zip(points, weights))
    sxy = sum(weight * (point["x"] - x_mean) * (point["y"] - y_mean) for point, weight in zip(points, weights))
    slope = 0.0 if sxx <= 1e-15 else sxy / sxx
    intercept = y_mean - slope * x_mean
    ss_tot = sum(weight * (point["y"] - y_mean) ** 2 for point, weight in zip(points, weights))
    ss_res = sum(weight * (point["y"] - (slope * point["x"] + intercept)) ** 2 for point, weight in zip(points, weights))
    r2 = 1.0 if ss_tot == 0 else 1 - ss_res / ss_tot
    rmse = math.sqrt(ss_res / max(1, n - 2)) if n > 2 else math.sqrt(ss_res / max(1, n))
    slope_stderr = math.sqrt((ss_res / max(1, n - 2)) / sxx) if n > 2 and sxx > 1e-15 else None
    return {
        "slope": slope,
        "intercept": intercept,
        "r2": max(0.0, min(1.0, r2)),
        "rmse": rmse,
        "slope_stderr": slope_stderr,
    }


def robust_linear_fit(points: list[dict], iterations: int = 4) -> dict:
    weighted_points = [dict(point, weight=max(0.001, float(point.get("weight", 1.0)))) for point in points]
    fit = weighted_linear_fit(weighted_points)
    for _ in range(iterations):
        residuals = [point["y"] - (fit["slope"] * point["x"] + fit["intercept"]) for point in weighted_points]
        sigma = robust_sigma(residuals)
        if sigma <= 1e-12:
            break
        huber = 1.345 * sigma
        next_points = []
        for point, residual in zip(weighted_points, residuals):
            robust_weight = 1.0 if abs(residual) <= huber else huber / max(abs(residual), 1e-12)
            next_points.append({**point, "weight": max(0.001, point.get("weight", 1.0) * robust_weight)})
        weighted_points = next_points
        fit = weighted_linear_fit(weighted_points)
    fit["method"] = "weighted_huber_linear_fit"
    return fit


def find_uniform_segment(velocities: list[dict]) -> dict:
    n = len(velocities)
    if n < 8:
        return {"start": 0, "end": max(0, n - 1), "score": 0.0, "cv": 0.0, "slope_penalty": 0.0}
    window_sizes = sorted({max(8, int(n * ratio)) for ratio in (0.18, 0.24, 0.30, 0.36)})
    window_sizes = [size for size in window_sizes if size < n - 2]
    if not window_sizes:
        window_sizes = [max(8, n - 2)]
    best_start = min(int(n * 0.45), max(0, n - window_sizes[0] - 1))
    best = {"start": best_start, "end": best_start + window_sizes[0], "score": float("inf")}

    for window_size in window_sizes:
        for start in range(int(n * 0.16), n - window_size):
            selected_points = velocities[start : start + window_size]
            selected = [point["v"] for point in selected_points]
            valid_conf = [point.get("confidence", 1.0) for point in selected_points]
            avg_conf = mean(valid_conf) if valid_conf else 1.0
            avg = mean(selected)
            if avg <= 0:
                continue
            sigma = robust_sigma(selected)
            cv = sigma / avg if avg else 0
            fit = weighted_linear_fit(
                [{"x": point["t"], "y": point["v"], "weight": point.get("confidence", 1.0)} for point in selected_points]
            )
            slope_penalty = abs(fit["slope"]) / avg
            early_penalty = 0.055 if start < n * 0.28 else 0
            short_penalty = 0.018 if window_size < n * 0.22 else 0
            confidence_penalty = (1 - avg_conf) * 0.11
            score = cv + slope_penalty * 8 + early_penalty + short_penalty + confidence_penalty
            if score < best["score"]:
                best = {
                    "start": start,
                    "end": start + window_size,
                    "score": score,
                    "cv": cv,
                    "slope_penalty": slope_penalty,
                    "avg_confidence": avg_conf,
                    "window_size": window_size,
                }
    return best


def preprocess_frames(frames: list[dict]) -> tuple[list[dict], dict]:
    ordered = sorted(frames, key=lambda item: float(item["t"]))
    cleaned = []
    dropped = 0
    last_t = None
    for frame in ordered:
        t = finite_float(frame.get("t"))
        y = finite_float(frame.get("corrected_y", frame.get("y", frame.get("position"))))
        if t is None or y is None:
            dropped += 1
            continue
        if last_t is not None and t <= last_t:
            dropped += 1
            continue
        measured_y = finite_float(frame.get("measured_y"), y)
        x = finite_float(frame.get("x"), 0.5)
        confidence = finite_float(frame.get("confidence"), 0.86)
        cleaned.append(
            {
                **frame,
                "t": round(t, 5),
                "x": round(max(0.0, min(1.0, x if x is not None else 0.5)), 5),
                "true_y": round(y, 6),
                "measured_y": round(measured_y if measured_y is not None else y, 6),
                "corrected_y": round(y, 6),
                "confidence": round(max(0.0, min(1.0, confidence if confidence is not None else 0.86)), 4),
            }
        )
        last_t = t

    if len(cleaned) < 3:
        return cleaned, {"dropped_points": dropped, "outlier_points": 0, "median_dt": 0.0}

    y_values = [frame["corrected_y"] for frame in cleaned]
    median_y = median_filter(y_values, 1)
    residuals = [raw - smooth for raw, smooth in zip(y_values, median_y)]
    sigma = robust_sigma(residuals)
    outliers = set()
    if sigma > 1e-9:
        outliers = {index for index, residual in enumerate(residuals) if abs(residual) > 3.5 * sigma}
    dt_values = [cleaned[index]["t"] - cleaned[index - 1]["t"] for index in range(1, len(cleaned))]
    median_dt = median(dt_values)
    for index, frame in enumerate(cleaned):
        if index in outliers:
            frame["confidence"] = min(frame["confidence"], 0.25)
            frame["corrected_y"] = round(median_y[index], 6)
            frame["outlier"] = True
        else:
            frame["outlier"] = False
    return cleaned, {"dropped_points": dropped, "outlier_points": len(outliers), "median_dt": median_dt}


def estimate_velocity(frames: list[dict]) -> list[dict]:
    if len(frames) < 2:
        return []
    y_values = [frame["corrected_y"] for frame in frames]
    smooth_y = moving_average(median_filter(y_values, 1), 2)
    raw_v = []
    for index in range(1, len(smooth_y)):
        dt = frames[index]["t"] - frames[index - 1]["t"]
        if dt <= 0:
            continue
        confidence = min(frames[index]["confidence"], frames[index - 1]["confidence"])
        raw_v.append({"t": frames[index]["t"], "v": (smooth_y[index] - smooth_y[index - 1]) / dt, "confidence": confidence})
    v_values = [point["v"] for point in raw_v]
    smooth_v = moving_average(median_filter(v_values, 1), 3)
    return [
        {"t": point["t"], "v": value, "confidence": point["confidence"]}
        for point, value in zip(raw_v, smooth_v)
    ]


def build_frames_from_trajectory(trajectory: list[dict]) -> list[dict]:
    normalized = []
    for index, point in enumerate(sorted(trajectory, key=lambda item: float(item.get("t", item.get("time", 0))))):
        t = float(point.get("t", point.get("time", index * 0.02)))
        y = float(point.get("corrected_y", point.get("y", point.get("position", 0))))
        x = float(point.get("x", 0.5))
        confidence = float(point.get("confidence", 0.86))
        normalized.append(
            {
                "frame": index,
                "t": round(t, 4),
                "x": round(max(0.0, min(1.0, x)), 5),
                "true_y": round(y, 6),
                "measured_y": round(float(point.get("measured_y", y)), 6),
                "corrected_y": round(y, 6),
                "confidence": round(max(0.0, min(1.0, confidence)), 4),
            }
        )
    return normalized


def analyze_trajectory(params: MeasurementParams, trajectory: list[dict], student: dict | None = None) -> dict:
    frames = build_frames_from_trajectory(trajectory)
    if len(frames) < 12:
        raise ValueError("trajectory requires at least 12 points")
    run = analyze_frames(params, frames, student=student)
    run["source"] = "csv"
    return run


def build_simulation(payload: dict) -> dict:
    scenario = str(payload.get("scenario", "standard"))
    initial_disturbance = max(0.0, min(1.0, float(payload.get("release_bias", 0.0))))
    damping_disturbance = max(0.0, min(1.0, float(payload.get("refraction", 0.0))))
    sampling_stability = max(0.2, min(1.0, float(payload.get("lighting", 1.0))))
    try:
        radius_mm = float(payload.get("radius_mm", 1.5))
        tube_diameter_mm = float(payload.get("tube_diameter_mm", 35.0))
        liquid_depth_mm = float(payload.get("liquid_depth_mm", 220.0))
    except (TypeError, ValueError):
        raise ValueError("无法模拟：小球半径、量筒内径和待测液体深度必须是有效数字。")
    if radius_mm <= 0:
        raise ValueError("无法模拟：小球半径 r 必须大于 0 mm。")
    if tube_diameter_mm <= 0:
        raise ValueError("无法模拟：量筒内径 D 必须大于 0 mm。")
    if liquid_depth_mm <= 0:
        raise ValueError("无法模拟：待测液体深度 H 必须大于 0 mm。")
    tube_ratio = (2 * radius_mm) / tube_diameter_mm
    if tube_ratio >= 1:
        raise ValueError(
            f"无法模拟：小球直径 2r={2 * radius_mm:.1f} mm，量筒内径 D={tube_diameter_mm:.1f} mm，2r/D={tube_ratio:.3f} ≥ 1。小球直径已大于或等于量筒内径，请增大量筒内径或减小小球半径。"
        )
    if 2 * radius_mm >= liquid_depth_mm:
        raise ValueError(
            f"无法模拟：小球直径 2r={2 * radius_mm:.1f} mm 已大于或等于待测液体深度 H={liquid_depth_mm:.1f} mm，无法形成有效下落区间。"
        )

    preset = SIMULATION_LIQUID_PRESETS.get(scenario, SIMULATION_LIQUID_PRESETS["standard"])
    effective_release = max(0.0, min(1.0, initial_disturbance + preset["disturbance_extra"]))
    effective_damping_noise = max(0.0, min(1.0, damping_disturbance + preset["damping_extra"]))
    effective_stability = max(0.2, min(1.0, sampling_stability + preset["stability_delta"]))
    params = MeasurementParams(
        liquid=preset["liquid"],
        rho_liquid=preset["rho_liquid"],
        eta_reference=preset["eta_reference"],
        radius_mm=radius_mm,
        rho_ball=7850.0,
        tube_diameter_mm=tube_diameter_mm,
        liquid_depth_mm=liquid_depth_mm,
        noise_level=1.0 - effective_stability,
        refraction_level=effective_damping_noise,
        temperature_c=preset["temperature_c"],
    )
    tube_ratio = (2 * params.radius_mm) / params.tube_diameter_mm
    depth_ratio = params.radius_mm / params.liquid_depth_mm
    min_practical_depth_mm = max(80.0, params.radius_mm * 12)
    simulated = terminal_velocity_from_viscosity(params, params.eta_reference)
    tube_level = "ok" if tube_ratio < 0.12 else "warn" if tube_ratio < 0.25 else "danger"
    reynolds_level = "ok" if simulated["re"] < 1 else "warn" if simulated["re"] < 5 else "danger"
    depth_level = "ok" if depth_ratio < 0.012 else "danger" if params.liquid_depth_mm < min_practical_depth_mm else "warn"
    terminal_velocity = simulated["terminal_velocity"]
    trajectory = []
    tau = 0.18 + effective_release * 0.11
    liquid_depth_m = params.liquid_depth_mm / 1000
    fall_time_s = max(0.7, liquid_depth_m / max(terminal_velocity, 1e-6) + tau)
    high = max(fall_time_s, tau * 4)
    for _ in range(24):
        y_high = terminal_velocity * (high - tau * (1 - math.exp(-high / tau)))
        if y_high >= liquid_depth_m:
            break
        high *= 1.45
        if high > 60:
            break
    low = 0.0
    for _ in range(48):
        mid = (low + high) / 2
        y_mid = terminal_velocity * (mid - tau * (1 - math.exp(-mid / tau)))
        if y_mid >= liquid_depth_m:
            high = mid
        else:
            low = mid
    fall_time_s = min(max(high, 0.7), 60.0)
    sample_count = max(96, min(240, int(fall_time_s / 0.035) + 1))
    dt = fall_time_s / max(sample_count - 1, 1)
    lateral_bias = (tube_ratio * 0.34) + (effective_release * 0.17)
    for index in range(sample_count):
        t = round(index * dt, 4)
        ideal_y = terminal_velocity * (t - tau * (1 - math.exp(-t / tau)))
        wave = math.sin(index * 0.43) * effective_damping_noise * 0.0015
        shimmer = math.sin(index * 1.73 + 0.6) * (1 - effective_stability) * 0.001
        release_kick = math.exp(-index / 11) * effective_release * 0.006
        drift = math.sin(index * 0.1) * lateral_bias * 0.08
        confidence = max(0.18, min(0.98, effective_stability - effective_damping_noise * 0.18 - abs(drift) * 0.65))
        if effective_damping_noise > 0.55 and index in {34, 35, 58, 59}:
            shimmer += 0.0035
            confidence = min(confidence, 0.42)
        trajectory.append(
            {
                "t": t,
                "y": round(min(liquid_depth_m, max(0.0, ideal_y + wave + shimmer + release_kick)), 6),
                "x": round(max(0.05, min(0.95, 0.5 + drift)), 5),
                "confidence": round(confidence, 4),
            }
        )

    run = analyze_trajectory(params, trajectory, student={})
    run["source"] = "simulation"
    risk_score = (
        100
        - effective_release * 18
        - effective_damping_noise * 16
        - (1 - effective_stability) * 26
        - max(0, tube_ratio - 0.12) * 110
        - max(0, depth_ratio - 0.012) * 520
        - max(0, simulated["re"] - 1) * 12
    )
    if tube_level == "warn":
        risk_score = min(risk_score, 80.0)
    elif tube_level == "danger":
        risk_score = min(risk_score, 58.0)
    if reynolds_level == "warn":
        risk_score = min(risk_score, 80.0)
    elif reynolds_level == "danger":
        risk_score = min(risk_score, 58.0)
    if depth_level == "warn":
        risk_score = min(risk_score, 80.0)
    elif depth_level == "danger":
        risk_score = min(risk_score, 58.0)
    risk_score = max(36.0, min(96.0, risk_score))
    has_danger = "danger" in {tube_level, reynolds_level, depth_level}
    has_warn = "warn" in {tube_level, reynolds_level, depth_level}
    risk_label = "高风险" if has_danger or risk_score < 66 else "需复核" if has_warn or risk_score < 82 else "低风险"
    rubric = [
        {
            "level": "ok" if effective_release < 0.28 else "warn",
            "title": "初始扰动",
            "message": "初始扰动较小，速度曲线能清楚展示加速到终端速度的过程。" if effective_release < 0.28 else "初始扰动偏大，前段速度会明显波动；真实实验中应使用导向释放夹具。",
        },
        {
            "level": "ok" if effective_damping_noise < 0.45 else "warn",
            "title": "速度采样稳定性",
            "message": "速度采样稳定，终端速度平台较容易观察。" if effective_damping_noise < 0.45 else "速度曲线扰动较大，建议在仿真中对比平滑前后的终端速度估计。",
        },
        {
            "level": tube_level,
            "title": "容器边界",
            "message": (
                f"2r/D={tube_ratio:.3f}，K壁={simulated['wall_correction']:.3f}，壁效应修正已纳入。"
                if tube_level == "ok"
                else f"2r/D={tube_ratio:.3f}，K壁={simulated['wall_correction']:.3f}，球筒径比过大，容器边界效应已明显超出低风险范围；建议更大容器或更小球。"
            ),
        },
        {
            "level": reynolds_level,
            "title": "雷诺数修正",
            "message": (
                f"Re={simulated['re']:.3f}，KRe={simulated['reynolds_correction']:.3f}，二级修正项已参与迭代。"
                if reynolds_level == "ok"
                else f"Re={simulated['re']:.3f}，已偏离 Re<1 的低雷诺数适用区；建议提高粘度、减小小球半径或降低下落速度。"
            ),
        },
        {
            "level": depth_level,
            "title": "液体深度",
            "message": (
                f"H={params.liquid_depth_mm:.0f} mm，r/H={depth_ratio:.4f}，端部深度修正较小。"
                if depth_ratio < 0.012
                else f"H={params.liquid_depth_mm:.0f} mm，r/H={depth_ratio:.4f}，液柱过浅，端部修正和终端速度平台都会失真；建议 H≥{min_practical_depth_mm:.0f} mm。"
                if params.liquid_depth_mm < min_practical_depth_mm
                else f"H={params.liquid_depth_mm:.0f} mm，r/H={depth_ratio:.4f}，液柱偏浅会放大端部修正。"
            ),
        },
    ]
    return {
        "run": run,
        "trajectory": trajectory,
        "simulation": {
            "scenario": scenario,
            "release_bias": effective_release,
            "refraction": effective_damping_noise,
            "lighting": effective_stability,
            "known_liquid": preset["liquid"],
            "known_eta": params.eta_reference,
            "fall_time_s": fall_time_s,
            "wall_correction": simulated["wall_correction"],
            "reynolds_correction": simulated["reynolds_correction"],
            "correction_total": simulated["correction_total"],
            "re": simulated["re"],
            "liquid_depth_mm": params.liquid_depth_mm,
            "risk_score": risk_score,
            "risk_label": risk_label,
            "rubric": rubric,
        },
    }


def inspect_video_metadata(payload: dict) -> dict:
    file_name = str(payload.get("name", "")).strip()
    mime_type = str(payload.get("type", "")).strip() or "未知"
    size = float(payload.get("size", 0) or 0)
    duration = to_optional_float(payload.get("duration"))
    width = int(payload.get("width", 0) or 0)
    height = int(payload.get("height", 0) or 0)
    fps = to_optional_float(payload.get("fps"))

    checklist = [
        {
            "key": "camera",
            "label": "固定机位",
            "status": "needs_input",
            "detail": "需要手机支架或三脚架，保证容器与镜头位置稳定。",
        },
        {
            "key": "calibration",
            "label": "像素标定",
            "status": "needs_input",
            "detail": "需要标定尺、标定板或已知直径小球，建立像素到长度的换算。",
        },
        {
            "key": "roi",
            "label": "容器区域",
            "status": "needs_input",
            "detail": "后续应框选小球下落区域，减少背景、反光和刻度文字干扰。",
        },
        {
            "key": "lighting",
            "label": "光照反光",
            "status": "needs_input",
            "detail": "需要补光均匀并减少容器表面高光，否则会影响圆心检测。",
        },
    ]
    warnings = []
    if size <= 0:
        warnings.append("未读取到有效文件大小。")
    if duration is None or duration <= 0:
        warnings.append("浏览器未能读取视频时长，请确认文件格式可播放。")
    if width <= 0 or height <= 0:
        warnings.append("浏览器未能读取分辨率，请确认视频元信息完整。")
    elif min(width, height) < 480:
        warnings.append("分辨率偏低，后续小球圆心定位可能不稳定。")
    if duration and duration < 0.8:
        warnings.append("视频时长较短，可能不足以覆盖加速段和匀速段。")
    if mime_type not in {"video/mp4", "video/quicktime", "video/webm", "video/x-m4v"}:
        warnings.append("建议优先使用 mp4、mov 或 webm，便于浏览器预览与后端解码。")

    return {
        "accepted": bool(file_name and size > 0 and duration and width and height),
        "name": file_name or "未命名视频",
        "type": mime_type,
        "size": size,
        "duration": duration,
        "resolution": {"width": width, "height": height},
        "fps": fps,
        "next_step": "完成标定、ROI与追踪参数后，再从视频提取 t-y 轨迹并进入粘度计算。",
        "warnings": warnings,
        "checklist": checklist,
    }


def analyze_frames(params: MeasurementParams, frames: list[dict], student: dict | None = None) -> dict:
    frames, preprocessing = preprocess_frames(frames)
    if len(frames) < 12:
        raise ValueError("trajectory requires at least 12 valid points after preprocessing")
    velocities = estimate_velocity(frames)
    if len(velocities) < 8:
        raise ValueError("trajectory requires enough valid points to estimate velocity")
    segment = find_uniform_segment(velocities)
    position_start = min(len(frames) - 2, max(0, segment["start"] + 1))
    position_end = min(len(frames), max(position_start + 3, segment["end"] + 2))
    fit_points = [
        {"x": point["t"], "y": point["corrected_y"], "weight": point["confidence"]}
        for point in frames[position_start:position_end]
    ]
    fit = robust_linear_fit(fit_points)
    vt = max(0.0001, fit["slope"])
    tube_ratio = (2 * params.radius_mm) / params.tube_diameter_mm
    corrected = viscosity_from_terminal_velocity(params, vt)
    eta = corrected["viscosity"]
    re = corrected["re"]
    selected_v = [point["v"] for point in velocities[segment["start"] : segment["end"]]]
    uncertainty_a = (robust_sigma(selected_v) / math.sqrt(max(1, len(selected_v)))) if len(selected_v) > 1 else 0
    if fit["slope_stderr"]:
        uncertainty_a = max(uncertainty_a, fit["slope_stderr"])
    relative_uncertainty = math.sqrt((uncertainty_a / vt) ** 2 + (params.noise_level * 0.012) ** 2 + (params.refraction_level * 0.01) ** 2)
    avg_confidence = mean(frame["confidence"] for frame in frames)
    quality = {
        "preprocessing": preprocessing,
        "fit_method": fit["method"],
        "fit_rmse": fit["rmse"],
        "terminal_velocity_stderr": fit["slope_stderr"],
        "uniform_segment_cv": segment.get("cv", 0.0),
        "uniform_segment_score": segment.get("score", 0.0),
        "uniform_segment_confidence": segment.get("avg_confidence", avg_confidence),
        "fit_point_count": len(fit_points),
    }
    student_payload = student or {}
    student_v = to_optional_float(student_payload.get("student_v"))
    student_eta = to_optional_float(student_payload.get("student_eta"))
    has_student_result = student_v is not None and student_eta is not None
    v_error = abs(student_v - vt) / vt if has_student_result else None
    eta_error = abs(student_eta - eta) / eta if has_student_result else None
    score = (
        max(48.0, min(98.0, 100 - eta_error * 260 - v_error * 160 - (1 - fit["r2"]) * 85))
        if has_student_result
        else None
    )
    diagnostics = build_diagnostics(params, fit["r2"], re, tube_ratio, score, v_error, eta_error, quality)

    return {
        "params": params.__dict__,
        "frames": frames,
        "curves": {
            "position": [{"t": frame["t"], "y": frame["corrected_y"]} for frame in frames],
            "velocity": [{"t": point["t"], "v": round(point["v"], 6)} for point in velocities],
        },
        "segment": segment,
        "result": {
            "terminal_velocity": vt,
            "viscosity": eta,
            "ideal_viscosity": corrected["ideal_viscosity"],
            "r2": fit["r2"],
            "re": re,
            "wall_correction": corrected["wall_correction"],
            "reynolds_correction": corrected["reynolds_correction"],
            "reynolds_correction_applied": corrected["reynolds_correction_applied"],
            "correction_total": corrected["correction_total"],
            "relative_uncertainty": relative_uncertainty,
            "tracking_confidence": avg_confidence,
        },
        "quality": quality,
        "student": {
            "student_v": student_v,
            "student_eta": student_eta,
            "v_error": v_error,
            "eta_error": eta_error,
            "score": score,
        },
        "diagnostics": diagnostics,
    }


def to_optional_float(value) -> float | None:
    if value in (None, ""):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def build_diagnostics(
    params: MeasurementParams,
    r2: float,
    re: float,
    tube_ratio: float,
    score: float | None,
    v_error: float | None,
    eta_error: float | None,
    quality: dict | None = None,
) -> list[dict]:
    diagnostics = []
    quality = quality or {}
    preprocessing = quality.get("preprocessing", {})
    outlier_points = int(preprocessing.get("outlier_points", 0) or 0)
    dropped_points = int(preprocessing.get("dropped_points", 0) or 0)
    segment_cv = float(quality.get("uniform_segment_cv", 0) or 0)
    segment_confidence = float(quality.get("uniform_segment_confidence", 1) or 1)

    if r2 >= 0.985:
        diagnostics.append({"level": "ok", "title": "匀速段拟合稳定", "message": f"终端速度拟合 R²={r2:.3f}，可作为AI参考结果进入复盘。"})
    else:
        diagnostics.append({"level": "warn", "title": "匀速段稳定性不足", "message": "速度曲线波动偏大，建议限制ROI并提高补光均匀性。"})

    if outlier_points or dropped_points:
        diagnostics.append(
            {
                "level": "warn",
                "title": "轨迹点已做稳健预处理",
                "message": f"过滤无效点 {dropped_points} 个，降权坏点 {outlier_points} 个；建议检查视频反光、遮挡或圆心检测阈值。",
            }
        )
    else:
        diagnostics.append({"level": "ok", "title": "轨迹点连续性良好", "message": "当前轨迹未发现明显无效点或突跳点，适合进入匀速段拟合。"})

    if segment_cv > 0.12 or segment_confidence < 0.68:
        diagnostics.append(
            {
                "level": "warn",
                "title": "匀速段质量需要复核",
                "message": f"候选匀速段速度离散度约 {segment_cv:.3f}，平均置信度 {segment_confidence:.2f}；建议复核ROI和小球追踪稳定性。",
            }
        )

    if re < 0.5:
        diagnostics.append({"level": "ok", "title": "Re条件满足", "message": f"当前 Re={re:.3f}，低雷诺数条件较好。"})
    else:
        diagnostics.append({"level": "danger", "title": "Re偏高", "message": "建议更换更高粘度液体或降低小球速度。"})

    if tube_ratio < 0.12:
        diagnostics.append({"level": "ok", "title": "壁效应风险较低", "message": f"当前 2r/D={tube_ratio:.3f}，保留修正项即可。"})
    else:
        diagnostics.append({"level": "warn", "title": "壁效应需要修正", "message": f"当前 2r/D={tube_ratio:.3f}，建议选更大容器或更小球。"})

    if eta_error is None or v_error is None:
        diagnostics.append({"level": "warn", "title": "未填写人工测量值", "message": "当前仅给出轨迹分析结果；填写人工测量值后再生成偏差诊断。"})
    elif eta_error < 0.05 and v_error < 0.05:
        diagnostics.append({"level": "ok", "title": "学生结果接近AI参考", "message": f"质量评分 {score:.0f}，偏差处于较好范围。"})
    elif eta_error < 0.12:
        diagnostics.append({"level": "warn", "title": "学生结果存在中等偏差", "message": "优先排查人工计时、匀速段选择和读数反应延迟。"})
    else:
        diagnostics.append({"level": "danger", "title": "学生结果偏差较大", "message": "建议检查小球是否偏斜、贴壁或释放时带有初速度。"})

    return diagnostics


EXPERIMENT_STRICT_KEYWORDS = [
    "落球",
    "粘滞",
    "黏滞",
    "粘度",
    "黏度",
    "粘性",
    "斯托克斯",
    "stokes",
    "终端速度",
    "匀速段",
    "雷诺",
    "雷诺数",
    "壁效应",
    "壁面效应",
    "器壁效应",
    "边界效应",
    "壁面",
    "筒壁",
    "管壁",
    "容器壁",
    "边界影响",
    "小球",
    "量筒",
    "量管",
    "容器",
    "管径",
    "液体",
    "甘油",
    "硅油",
    "密度",
    "浮力",
    "阻力",
    "轨迹",
    "速度曲线",
    "位移",
    "拟合",
    "标定",
    "折射",
    "释放",
    "初速度",
    "贴壁",
    "偏斜",
    "帧率",
    "摄像",
    "相机",
    "镜头",
    "像素",
    "roi",
    "视频追踪",
    "视觉测量",
    "ai视觉",
    "ai实验",
    "虚拟仿真",
    "粘滞系数",
    "黏滞系数",
    "实验流程",
    "实验步骤",
    "测量流程",
    "操作流程",
    "ai实验流程",
    "仿真流程",
]

EXPERIMENT_CONTEXT_KEYWORDS = [
    "讲义",
    "试题",
    "题目",
    "错题",
    "本题",
    "这题",
    "上题",
    "答案",
    "解析",
    "准入",
    "测试",
    "实验大厅",
    "公式",
    "器材",
    "步骤",
    "流程",
    "操作",
    "方法",
    "原理",
    "误差",
    "数据",
    "结果",
    "问答",
    "答疑",
    "联网",
    "网络",
    "搜索",
    "来源",
    "资料来源",
]

UNRELATED_TOPIC_KEYWORDS = [
    "天气",
    "股票",
    "基金",
    "旅游",
    "美食",
    "电影",
    "游戏",
    "明星",
    "八卦",
    "小说",
    "作文",
    "历史",
    "地理",
    "政治",
    "英语",
    "编程",
    "代码",
    "作业",
    "购物",
    "恋爱",
]


def contains_keyword(text: str, keywords: list[str]) -> bool:
    return any(keyword.lower() in text for keyword in keywords)


def is_experiment_related_question(question: str) -> bool:
    text = question.strip().lower()
    if not text:
        return False
    if contains_keyword(text, EXPERIMENT_STRICT_KEYWORDS):
        return True
    if re.search(r"(?<![a-z])re(?![a-z])", text):
        return True
    if contains_keyword(text, EXPERIMENT_CONTEXT_KEYWORDS):
        return not contains_keyword(text, UNRELATED_TOPIC_KEYWORDS)
    return False


def wants_run_context(question: str) -> bool:
    text = question.lower()
    return contains_keyword(text, ["本次", "最近", "当前", "结果", "数据", "记录", "csv", "导入", "测量值", "报告"])


def latest_measurement_text(latest: dict | None) -> str:
    if not latest:
        return "当前还没有导入真实轨迹或视频数据；完成一次测量后，我可以结合本次 vt、η、R² 和 Re 做针对性诊断。"
    result = latest["result"]
    return f"最近一次测量：vt={result['terminal_velocity']:.4f} m/s，η={result['viscosity']:.3f} Pa·s，R²={result['r2']:.3f}，Re={result['re']:.3f}。"


def local_quiz_tutor_answer(context: dict | None) -> str | None:
    if not isinstance(context, dict) or not str(context.get("kind", "")).startswith("quiz"):
        return None
    quiz = context.get("quiz") or {}
    if isinstance(quiz, dict) and "items" in quiz:
        wrong = [item for item in quiz.get("items", []) if not item.get("correct")]
        if not wrong:
            return "这次预习作业全部答对。先别急着跳过复盘：你可以再问自己两个问题，终端速度为什么必须来自稳定平台段？Re 和壁效应分别在限制什么？如果这两个问题能说清楚，就可以进入实验。"
        focus = wrong[0]
        return (
            f"这次主要需要回看第 {focus.get('index')} 题附近的知识点。"
            f"你选的是“{focus.get('selectedText', '未作答')}”，标准答案指向“{focus.get('answerText', '')}”。"
            "先想一个问题：这道题考的是实验操作顺序、物理适用条件，还是数据复核？"
            "把这个考点定位出来，再回到讲义对应段落重读一遍。"
        )
    if isinstance(quiz, dict) and quiz.get("title"):
        selected = quiz.get("selectedText") or "未作答"
        answer = quiz.get("answerText") or "标准答案"
        title = quiz.get("title")
        return (
            f"我们只看这道题：{title}。你当前选择是“{selected}”，标准答案是“{answer}”。"
            "先别背答案，先问自己：这个选项是否满足落球法的核心条件，比如终端匀速、低 Re、中心线标定或壁效应控制？"
            "如果你的选项忽略了这些条件，它就很可能只是看起来合理，但不符合实验判据。"
        )
    return None


def local_answer_question(question: str, latest: dict | None) -> str:
    if not is_experiment_related_question(question):
        return "这个问题与落球法测粘、AI视觉测量、虚拟仿真、讲义、试题解析或实验误差分析无关，我不能在本系统中回答。"

    text = question.lower()
    context = f" {latest_measurement_text(latest)}" if wants_run_context(question) else ""

    if contains_keyword(text, ["联网", "网络", "搜索", "资料来源", "来源", "接入"]):
        return "当前系统内置的是实验专用离线答疑，不是联网通用大模型。这样做的好处是比赛现场即使没有网络也能稳定回答讲义、试题、落球法、AI视觉测量和仿真问题；不足是开放式问题需要提前做知识库。若要做成联网增强版，可以接入搜索API或大模型API，但仍应限制只回答实验相关内容。"
    if contains_keyword(text, ["流程", "步骤", "操作", "方法", "怎么做", "如何做", "实验流程", "实验步骤", "测量流程", "ai实验流程", "仿真流程"]):
        return "这个问题属于实验流程，可以回答。\n\n推荐流程可以分成四段：\n\n1. 预习准入：先阅读实验讲义，理解 Stokes 公式、终端速度、低雷诺数条件和壁效应，再完成准入试题。\n\n2. AI 实验测量：固定量筒、释放装置和摄像机；完成像素-长度标定与容器边界确认；拍摄小球下落视频或导入轨迹数据；系统识别小球轨迹并生成位移-时间、速度-时间曲线。\n\n3. 结果计算：从速度曲线中识别稳定匀速段，拟合终端速度 vt；结合小球半径、密度差、液体密度和壁效应修正计算黏滞系数；同时复核 Re、2r/D、R² 和异常轨迹点。\n\n4. 仿真与复盘：在虚拟仿真中选定已知液体和容器参数，观察小球速度形成过程；再把真实测量结果与仿真曲线、人工测量值对照，输出误差来源和改进建议。"
    if contains_keyword(text, ["re", "雷诺", "雷诺数"]):
        return "你问的“雷诺系数”和实验里说的“雷诺数 Re”通常是在指同一个无量纲判据；更规范的叫法是雷诺数。\n\n它用来判断流动中惯性效应和黏性效应谁更占主导。对落球法来说，Re 越小，越接近 Stokes 公式适用的低雷诺数条件。\n\n结论：教学实验里通常把 Re<1 作为 Stokes 公式基本适用判据；更保守、更接近“蠕动流”的要求可取 Re<0.1。\n\n计算式：Re=ρ液·vt·d/η，其中 ρ液 是液体密度，vt 是终端速度，d 是小球直径，η 是液体黏滞系数。\n\n若 Re 接近或超过 1，应考虑换更小的小球、更高黏度液体，或降低下落速度。" + context
    if contains_keyword(text, ["stokes", "斯托克斯", "适用", "成立条件", "条件"]):
        return "Stokes 公式适用的关键条件有四个：\n\n1. 小球近似刚性、光滑、球形。\n2. 小球已经进入稳定的终端匀速下落阶段。\n3. 流动处于低雷诺数的黏性主导状态，通常至少 Re<1，保守实验取 Re<0.1。\n4. 容器壁影响较小，或者已经做壁效应修正。\n\n若小球太大、速度太快、贴壁、释放带初速度，都会破坏这些条件。参考资料：LibreTexts《Settling of Spheres》与 American Laboratory falling ball viscometer 资料均把 Re<1 作为 Stokes 区间的重要判据。"
    if contains_keyword(text, ["壁效应", "壁面效应", "器壁效应", "边界效应", "壁面", "筒壁", "管壁", "容器壁", "边界影响", "管径", "筒径", "量筒", "容器", "半径"]):
        return "壁面效应、器壁效应和壁效应在这个实验语境里说的是同一类问题：量筒不是无限宽的液体环境，筒壁会限制小球周围液体的流动，使黏性阻力条件偏离理想 Stokes 模型。\n\n影响：小球越大、量筒越窄，壁面影响越明显，测得的终端速度和由此计算出的黏滞系数都会出现系统偏差。\n\n判断：常看球筒径比，例如 2r/D。这个值越小越好；若 2r/D 偏大，就应提示壁效应风险。\n\n处理：实验上选更小的小球或更大内径量筒，让小球尽量沿中心轴线下落；计算上保留壁效应修正，并在报告里说明修正依据。"
    if contains_keyword(text, ["公式", "计算", "怎么算", "粘滞系数", "黏滞系数", "粘度", "黏度"]):
        return "落球法的核心计算来自终端匀速阶段的受力平衡：重力-浮力-黏滞阻力=0。理想 Stokes 公式可写为 η=2r²g(ρ球-ρ液)/(9vt)，其中 r 是小球半径，vt 是终端速度。实际量筒不是无限宽液体，所以系统还会结合球筒径比、Re 和壁效应修正来判断结果是否可信。" + context
    if contains_keyword(text, ["匀速", "终端", "速度", "vt"]):
        return "落球法真正用于计算黏滞系数的是终端速度 vt。小球刚释放时还在加速，不能直接拿前段速度计算；进入匀速段后，重力、浮力和黏滞阻力达到平衡，速度曲线会变得平稳。系统通过位移-时间曲线和速度曲线寻找波动较小、线性拟合更稳定的区间，从而减少人工目视选段误差。" + context
    if contains_keyword(text, ["折射", "补偿", "标定", "像素", "相机", "摄像", "视觉"]):
        return "立项报告中的方案是用标定映射模型做折射畸变补偿，用代码修正替代复杂硬件光学补偿。真实实验时需要标定板或标定球建立映射，并用重复实验检查补偿前后轨迹是否稳定。"
    if contains_keyword(text, ["释放", "初速度", "偏斜", "贴壁", "磁铁", "夹具"]):
        return "释放装置的目标是让小球从量筒中心轴线附近静止释放。若释放时带有初速度、横向偏斜或贴近筒壁，速度曲线前段会异常，后续终端速度也可能受影响。系统应观察小球横向轨迹、匀速段稳定性和异常点，并提示是否需要重测。" + context
    if contains_keyword(text, ["误差", "偏差", "评分", "诊断", "不准"]):
        return "落球法常见误差包括：人工计时反应延迟、匀速段选取不一致、释放初速度、小球偏斜或贴壁、量筒壁效应、温度变化导致黏度改变、折射和反光造成视觉定位误差。AI 系统的价值是把这些误差落到证据上：轨迹、速度曲线、拟合 R²、Re、球筒径比和异常点。" + context
    if contains_keyword(text, ["仿真", "模拟", "虚拟"]):
        return "虚拟仿真模块适合做变量控制：先选定液体密度、参考黏度、小球半径和密度，再输出小球下落轨迹、速度曲线和终端速度。它的作用不是替代真实实验，而是让学生先看清参数如何影响 vt 和 η，再回到 AI 实验测量中验证。"
    if contains_keyword(text, ["功能", "边界", "模块", "验证", "比赛", "答辩", "定位"]):
        return "比赛表达上要强调这套系统的边界：它不是替代学生实验，而是把传统落球法中的人工读数和主观选段，升级为可复盘的 AI 视觉测量、速度拟合、误差诊断和仿真对照。评委最关心的是主链路是否跑通、物理判据是否正确、真实视频和标定方案是否可信。"
    if contains_keyword(text, ["电脑", "设备", "现在", "可行"]):
        return "只有电脑时可以先完成软件闭环：讲义预习、准入试题、仿真参数、轨迹输入、速度曲线、匀速段识别、终端速度拟合、黏滞系数计算和误差诊断。真实设备阶段仍要补上固定机位拍摄、标定、重复测量和误差分析。"
    if contains_keyword(text, ["题", "试题", "答案", "解析", "讲义"]):
        return "这部分问题要回到讲义主线：先判断小球是否进入终端匀速，再看 Stokes 公式是否适用，重点复核 Re、壁效应、释放质量和视觉标定。若是错题，建议按“题目考点-正确选项-为什么其他选项不对”的顺序复盘。"
    return "这个问题属于实验相关内容，但我需要更具体一点才能答准。你可以围绕 Re 判据、Stokes 公式、终端速度、壁效应、AI 视觉标定、仿真参数或误差诊断继续追问。"


def extract_chat_completion_text(payload: dict) -> str:
    choices = payload.get("choices", [])
    if choices:
        message = choices[0].get("message", {})
        return (message.get("content") or "").strip()
    return ""


def quiz_tutor_system_prompt(context: dict | None = None) -> str:
    if not isinstance(context, dict) or not str(context.get("kind", "")).startswith("quiz"):
        return (
            "你是一个中学/大学物理实验教师，只回答落球法测量液体粘滞系数、AI视觉测量、"
            "虚拟仿真、实验讲义、试题解析和误差分析相关问题。若问题无关，直接拒答。"
            "回答要先给结论，再给公式、原因和实验建议。"
        )
    return (
        "你是落球法 AI 实验平台的预习作业问答 agent。你的任务不是直接替学生背答案，"
        "而是根据学生在每道题上的真实选择进行针对性辅导。必须采用苏格拉底式教学："
        "先指出学生选择暴露出的概念卡点，再提出2到4个短问题引导学生自己修正。"
        "如果学生问错题，必须结合题目、学生所选选项、正确选项和讲义知识点说明。"
        "不要展开成长篇条列，不要一次性把所有错题铺开；回答要短、具体、可追问。"
        "只回答落球法、Stokes 定律、终端速度、雷诺数、壁效应、标定、背光成像、AI视觉测量、误差分析和本次试题相关内容。"
        "最后给一个可执行的复习动作，例如回看讲义中的某个条件、画出受力平衡、检查 v-t 图平台段。"
    )


def answer_question_online(question: str, latest: dict | None, context: dict | None = None) -> dict | None:
    api_key = os.environ.get("ARK_API_KEY", "f8591ebf-5301-4922-ae6f-c1eb942643e5")
    base_url = os.environ.get("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/coding/v3")
    model = os.environ.get("ARK_MODEL", "ark-code-latest")
    measurement_context = latest_measurement_text(latest) if wants_run_context(question) else "学生当前在预习或答疑阶段，未必需要结合本次测量数据。"
    tutor_context = json.dumps(context, ensure_ascii=False, indent=2) if isinstance(context, dict) else "无单题上下文。"
    body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": quiz_tutor_system_prompt(context),
            },
            {
                "role": "user",
                "content": f"问题：{question}\n实验上下文：{measurement_context}\n作业/题目上下文：{tutor_context}",
            },
        ],
    }
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None
    answer = extract_chat_completion_text(payload)
    if not answer:
        return None
    return {"answer": answer, "mode": "online", "sources": []}


def answer_question(question: str, latest: dict | None, context: dict | None = None) -> dict:
    has_quiz_context = isinstance(context, dict) and str(context.get("kind", "")).startswith("quiz")
    if not has_quiz_context and not is_experiment_related_question(question):
        return {
            "answer": "这个问题与落球法测粘、AI视觉测量、虚拟仿真、讲义、试题解析或实验误差分析无关，我不能在本系统中回答。",
            "mode": "guarded",
            "sources": [],
        }
    online = answer_question_online(question, latest, context)
    if online:
        return online
    local_quiz = local_quiz_tutor_answer(context)
    if local_quiz:
        return {"answer": local_quiz, "mode": "local", "sources": []}
    return {"answer": local_answer_question(question, latest), "mode": "local", "sources": []}
