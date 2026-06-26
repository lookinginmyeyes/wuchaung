import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "measurements.sqlite3"
VIDEO_DIR = DATA_DIR / "videos"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY", "")
SUPABASE_TABLE = os.environ.get("SUPABASE_RUNS_TABLE", "runs")


def use_supabase() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def storage_status() -> dict:
    if use_supabase():
        return {
            "backend": "supabase",
            "url": SUPABASE_URL,
            "table": SUPABASE_TABLE,
        }
    return {
        "backend": "sqlite",
        "path": str(DB_PATH),
    }


def supabase_request(method: str, path: str, payload=None, headers: dict | None = None):
    if not use_supabase():
        raise RuntimeError("Supabase is not configured")
    url = f"{SUPABASE_URL}/rest/v1/{path.lstrip('/')}"
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request_headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        **(headers or {}),
    }
    request = Request(url, data=body, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase request failed: {error.code} {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Supabase request failed: {error.reason}") from error
    if not raw:
        return None
    return json.loads(raw)


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    if use_supabase():
        return
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                liquid TEXT NOT NULL,
                terminal_velocity REAL NOT NULL,
                viscosity REAL NOT NULL,
                r2 REAL NOT NULL,
                re REAL NOT NULL,
                score REAL,
                payload TEXT NOT NULL
            )
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(runs)").fetchall()}
        if "source" not in columns:
            conn.execute("ALTER TABLE runs ADD COLUMN source TEXT NOT NULL DEFAULT 'csv'")
        score_column = next((row for row in conn.execute("PRAGMA table_info(runs)").fetchall() if row["name"] == "score"), None)
        if score_column and score_column["notnull"]:
            migrate_nullable_score(conn)
        conn.commit()


def migrate_nullable_score(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runs_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            liquid TEXT NOT NULL,
            terminal_velocity REAL NOT NULL,
            viscosity REAL NOT NULL,
            r2 REAL NOT NULL,
            re REAL NOT NULL,
            score REAL,
            payload TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'csv'
        )
        """
    )
    conn.execute(
        """
        INSERT INTO runs_new (
            id, created_at, liquid, terminal_velocity, viscosity, r2, re, score, payload, source
        )
        SELECT id, created_at, liquid, terminal_velocity, viscosity, r2, re, score, payload, source
        FROM runs
        """
    )
    conn.execute("DROP TABLE runs")
    conn.execute("ALTER TABLE runs_new RENAME TO runs")


def save_run(payload: dict) -> int:
    if use_supabase():
        return supabase_save_run(payload)
    result = payload["result"]
    student = payload["student"]
    params = payload["params"]
    source = payload.get("source", "csv")
    with connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO runs (
                created_at, liquid, terminal_velocity, viscosity, r2, re, score, payload, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.now().isoformat(timespec="seconds"),
                params["liquid"],
                result["terminal_velocity"],
                result["viscosity"],
                result["r2"],
                result["re"],
                student.get("score"),
                json.dumps(payload, ensure_ascii=False),
                source,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


def _video_payload(filename: str, mime_type: str, size: int) -> dict:
    return {
        "filename": filename,
        "mime_type": mime_type,
        "size": int(size),
        "url": f"/api/videos/{filename}",
    }


def _safe_video_path(filename: str) -> Path | None:
    if not filename:
        return None
    try:
        path = (VIDEO_DIR / Path(filename).name).resolve()
        path.relative_to(VIDEO_DIR.resolve())
    except ValueError:
        return None
    return path


def _delete_video_file(video: dict | None) -> None:
    filename = (video or {}).get("filename")
    path = _safe_video_path(filename)
    if path and path.exists():
        path.unlink(missing_ok=True)


def attach_run_video(run_id: int, filename: str, mime_type: str, size: int) -> dict | None:
    if use_supabase():
        return supabase_attach_run_video(run_id, filename, mime_type, size)
    with connect() as conn:
        row = conn.execute("SELECT payload FROM runs WHERE id = ?", (run_id,)).fetchone()
        if not row:
            return None
        payload = json.loads(row["payload"])
        _delete_video_file(payload.get("video"))
        payload["video"] = _video_payload(filename, mime_type, size)
        conn.execute("UPDATE runs SET payload = ? WHERE id = ?", (json.dumps(payload, ensure_ascii=False), run_id))
        conn.commit()
        return payload["video"]


def list_runs(limit: int = 20) -> list[dict]:
    if use_supabase():
        return supabase_list_runs(limit)
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, created_at, liquid, terminal_velocity, viscosity, r2, re, score, source, payload
            FROM runs
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    records = []
    for row in rows:
        record = dict(row)
        payload = json.loads(record.pop("payload"))
        video = payload.get("video") or {}
        record["has_video"] = bool(video.get("url"))
        record["video_url"] = video.get("url")
        records.append(record)
    return records


def get_run(run_id: int) -> dict | None:
    if use_supabase():
        return supabase_get_run(run_id)
    with connect() as conn:
        row = conn.execute("SELECT payload FROM runs WHERE id = ?", (run_id,)).fetchone()
    if not row:
        return None
    payload = json.loads(row["payload"])
    payload["id"] = run_id
    return payload


def update_run_payload(run_id: int, payload: dict) -> dict | None:
    score = (payload.get("student") or {}).get("score")
    if use_supabase():
        query = urlencode({"id": f"eq.{int(run_id)}"})
        supabase_request(
            "PATCH",
            f"{SUPABASE_TABLE}?{query}",
            {"payload": payload, "score": score},
            headers={"Prefer": "return=minimal"},
        )
        payload["id"] = int(run_id)
        return payload
    with connect() as conn:
        row = conn.execute("SELECT id FROM runs WHERE id = ?", (run_id,)).fetchone()
        if not row:
            return None
        conn.execute(
            "UPDATE runs SET payload = ?, score = ? WHERE id = ?",
            (json.dumps(payload, ensure_ascii=False), score, run_id),
        )
        conn.commit()
    payload["id"] = int(run_id)
    return payload


def delete_run(run_id: int) -> bool:
    if use_supabase():
        return supabase_delete_run(run_id)
    with connect() as conn:
        row = conn.execute("SELECT payload FROM runs WHERE id = ?", (run_id,)).fetchone()
        cursor = conn.execute("DELETE FROM runs WHERE id = ?", (run_id,))
        conn.commit()
    if cursor.rowcount > 0 and row:
        _delete_video_file(json.loads(row["payload"]).get("video"))
    return cursor.rowcount > 0


def delete_runs(run_ids: list[int]) -> int:
    if use_supabase():
        return supabase_delete_runs(run_ids)
    clean_ids = []
    for raw_id in run_ids:
        try:
            run_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if run_id > 0:
            clean_ids.append(run_id)
    clean_ids = sorted(set(clean_ids))
    if not clean_ids:
        return 0
    placeholders = ",".join("?" for _ in clean_ids)
    with connect() as conn:
        rows = conn.execute(f"SELECT payload FROM runs WHERE id IN ({placeholders})", clean_ids).fetchall()
        cursor = conn.execute(f"DELETE FROM runs WHERE id IN ({placeholders})", clean_ids)
        conn.commit()
    if cursor.rowcount > 0:
        for row in rows:
            _delete_video_file(json.loads(row["payload"]).get("video"))
    return int(cursor.rowcount)


def latest_run() -> dict | None:
    if use_supabase():
        return supabase_latest_run()
    with connect() as conn:
        row = conn.execute("SELECT id, payload FROM runs ORDER BY id DESC LIMIT 1").fetchone()
    if not row:
        return None
    payload = json.loads(row["payload"])
    payload["id"] = row["id"]
    return payload


def supabase_row_from_payload(payload: dict) -> dict:
    result = payload["result"]
    student = payload["student"]
    params = payload["params"]
    return {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "liquid": params["liquid"],
        "terminal_velocity": result["terminal_velocity"],
        "viscosity": result["viscosity"],
        "r2": result["r2"],
        "re": result["re"],
        "score": student.get("score"),
        "payload": payload,
        "source": payload.get("source", "csv"),
    }


def normalise_supabase_payload(row: dict) -> dict:
    payload = row.get("payload") or {}
    if isinstance(payload, str):
        payload = json.loads(payload)
    payload["id"] = row["id"]
    return payload


def supabase_save_run(payload: dict) -> int:
    rows = supabase_request(
        "POST",
        SUPABASE_TABLE,
        [supabase_row_from_payload(payload)],
        headers={"Prefer": "return=representation"},
    )
    if not rows:
        raise RuntimeError("Supabase did not return inserted run")
    return int(rows[0]["id"])


def supabase_get_row(run_id: int) -> dict | None:
    query = urlencode({"id": f"eq.{int(run_id)}", "select": "id,payload"})
    rows = supabase_request("GET", f"{SUPABASE_TABLE}?{query}") or []
    return rows[0] if rows else None


def supabase_attach_run_video(run_id: int, filename: str, mime_type: str, size: int) -> dict | None:
    row = supabase_get_row(run_id)
    if not row:
        return None
    payload = normalise_supabase_payload(row)
    _delete_video_file(payload.get("video"))
    payload["video"] = _video_payload(filename, mime_type, size)
    query = urlencode({"id": f"eq.{int(run_id)}"})
    supabase_request(
        "PATCH",
        f"{SUPABASE_TABLE}?{query}",
        {"payload": payload},
        headers={"Prefer": "return=minimal"},
    )
    return payload["video"]


def supabase_list_runs(limit: int = 20) -> list[dict]:
    safe_limit = max(1, min(int(limit), 100))
    query = urlencode({
        "select": "id,created_at,liquid,terminal_velocity,viscosity,r2,re,score,source,payload",
        "order": "id.desc",
        "limit": str(safe_limit),
    })
    rows = supabase_request("GET", f"{SUPABASE_TABLE}?{query}") or []
    records = []
    for row in rows:
        payload = row.pop("payload") or {}
        if isinstance(payload, str):
            payload = json.loads(payload)
        video = payload.get("video") or {}
        row["has_video"] = bool(video.get("url"))
        row["video_url"] = video.get("url")
        records.append(row)
    return records


def supabase_get_run(run_id: int) -> dict | None:
    row = supabase_get_row(run_id)
    return normalise_supabase_payload(row) if row else None


def supabase_delete_run(run_id: int) -> bool:
    row = supabase_get_row(run_id)
    if not row:
        return False
    query = urlencode({"id": f"eq.{int(run_id)}"})
    supabase_request("DELETE", f"{SUPABASE_TABLE}?{query}", headers={"Prefer": "return=minimal"})
    _delete_video_file(normalise_supabase_payload(row).get("video"))
    return True


def supabase_delete_runs(run_ids: list[int]) -> int:
    clean_ids = []
    for raw_id in run_ids:
        try:
            run_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if run_id > 0:
            clean_ids.append(run_id)
    clean_ids = sorted(set(clean_ids))
    if not clean_ids:
        return 0
    id_filter = f"in.({','.join(str(item) for item in clean_ids)})"
    select_query = urlencode({"id": id_filter, "select": "id,payload"})
    rows = supabase_request("GET", f"{SUPABASE_TABLE}?{select_query}") or []
    delete_query = urlencode({"id": id_filter})
    supabase_request("DELETE", f"{SUPABASE_TABLE}?{delete_query}", headers={"Prefer": "return=minimal"})
    for row in rows:
        _delete_video_file(normalise_supabase_payload(row).get("video"))
    return len(rows)


def supabase_latest_run() -> dict | None:
    query = urlencode({"select": "id,payload", "order": "id.desc", "limit": "1"})
    rows = supabase_request("GET", f"{SUPABASE_TABLE}?{query}") or []
    return normalise_supabase_payload(rows[0]) if rows else None


def build_report_text(run: dict) -> str:
    params = run["params"]
    result = run["result"]
    student = run["student"]
    diagnostics = run["diagnostics"]
    quality = run.get("quality", {})
    preprocessing = quality.get("preprocessing", {})
    lines = [
        "# 基于AI视觉的落球法液体粘滞系数智能测量系统实验报告",
        "",
        "## 基本信息",
        "| 项目 | 数值 |",
        "|---|---:|",
        f"| 记录ID | {run.get('id', '-')} |",
        f"| 样本液体 | {params['liquid']} |",
        f"| 温度 | {params['temperature_c']} ℃ |",
        f"| 液体密度 | {params['rho_liquid']} kg/m^3 |",
        f"| 小球半径 | {params['radius_mm']} mm |",
        f"| 小球密度 | {params['rho_ball']} kg/m^3 |",
        f"| 量筒内径 | {params['tube_diameter_mm']} mm |",
        f"| 液体深度 | {params.get('liquid_depth_mm', '-')} mm |",
        "",
        "## AI参考结果",
        "| 指标 | 数值 |",
        "|---|---:|",
        f"| 终端速度 vt | {result['terminal_velocity']:.6f} m/s |",
        f"| 理想公式粘滞系数 η_ideal | {result.get('ideal_viscosity', result['viscosity']):.6f} Pa·s |",
        f"| 修正粘滞系数 η | {result['viscosity']:.6f} Pa·s |",
        f"| 线性拟合 R² | {result['r2']:.4f} |",
        f"| Re | {result['re']:.4f} |",
        f"| 壁效应修正因子 | {result['wall_correction']:.4f} |",
        f"| 追踪平均置信度 | {result['tracking_confidence'] * 100:.1f}% |",
        f"| 相对不确定度估计 | {result['relative_uncertainty'] * 100:.2f}% |",
        f"| 拟合方法 | {quality.get('fit_method', 'linear_fit')} |",
        f"| 匀速段速度离散度 | {float(quality.get('uniform_segment_cv', 0)):.4f} |",
        f"| 降权坏点数 | {int(preprocessing.get('outlier_points', 0) or 0)} |",
        f"| 无效轨迹点数 | {int(preprocessing.get('dropped_points', 0) or 0)} |",
        "",
        "## 人工测量值对比",
        "| 指标 | 人工值 | AI参考值 | 相对偏差 |",
        "|---|---:|---:|---:|",
        report_compare_row("终端速度 vt", student.get("student_v"), result["terminal_velocity"], "m/s", student.get("v_error")),
        report_compare_row("粘滞系数 η", student.get("student_eta"), result["viscosity"], "Pa·s", student.get("eta_error")),
        f"| 质量评分 | {format_report_value(student.get('score'), '', 0)} | - | - |",
        "",
        "## 分层异常诊断",
        "| 等级 | 诊断项 | 建议 |",
        "|---|---|---|",
    ]
    for item in diagnostics:
        lines.append(f"| {item['level']} | {item['title']} | {item['message']} |")
    lines.append("")
    lines.append("说明: 当前报告用于辅助复盘和软件链路验证，不替代学生实验操作、原始记录、误差分析和物理结论；真实物理精度需要接入固定机位、标定板、透明容器和实际落球视频后验证。")
    return "\n".join(lines)


def report_compare_row(label: str, student_value, ai_value, unit: str, relative_error) -> str:
    return (
        f"| {label} | {format_report_value(student_value, unit, 6)} | "
        f"{format_report_value(ai_value, unit, 6)} | {format_percent(relative_error)} |"
    )


def format_report_value(value, unit: str = "", digits: int = 3) -> str:
    if value is None:
        return "未填写"
    suffix = f" {unit}" if unit else ""
    return f"{float(value):.{digits}f}{suffix}"


def format_percent(value) -> str:
    if value is None:
        return "未填写"
    return f"{float(value) * 100:.2f}%"


def format_optional(label: str, value, unit: str = "", digits: int = 3) -> str:
    if value is None:
        return f"{label}: 未填写"
    suffix = f" {unit}" if unit else ""
    return f"{label}: {float(value):.{digits}f}{suffix}"
