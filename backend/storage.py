import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]


def load_env_file(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file()

DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "measurements.sqlite3"
VIDEO_DIR = DATA_DIR / "videos"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY", "")
SUPABASE_TABLE = os.environ.get("SUPABASE_RUNS_TABLE", "runs")
SUPABASE_VIDEO_BUCKET = os.environ.get("SUPABASE_VIDEO_BUCKET", "").strip()
SUPABASE_VIDEO_PREFIX = os.environ.get("SUPABASE_VIDEO_PREFIX", "videos").strip("/")
REMOTE_VIDEO_BASE_URL = os.environ.get("REMOTE_VIDEO_BASE_URL", "").rstrip("/")


def use_supabase() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def use_supabase_storage() -> bool:
    return bool(use_supabase() and SUPABASE_VIDEO_BUCKET)


def storage_status() -> dict:
    if use_supabase():
        return {
            "backend": "supabase",
            "url": SUPABASE_URL,
            "table": SUPABASE_TABLE,
            "video_backend": "supabase_storage" if use_supabase_storage() else "local_files",
            "video_bucket": SUPABASE_VIDEO_BUCKET or None,
            "remote_video_base_url": REMOTE_VIDEO_BASE_URL or None,
        }
    return {
        "backend": "sqlite",
        "path": str(DB_PATH),
        "video_backend": "local_files",
        "remote_video_base_url": REMOTE_VIDEO_BASE_URL or None,
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


def supabase_storage_request(
    method: str,
    object_path: str,
    data: bytes | None = None,
    content_type: str = "application/octet-stream",
    range_header: str | None = None,
) -> dict:
    if not use_supabase_storage():
        raise RuntimeError("Supabase Storage is not configured")
    safe_bucket = quote(SUPABASE_VIDEO_BUCKET, safe="")
    safe_object = quote(object_path.lstrip("/"), safe="/")
    url = f"{SUPABASE_URL}/storage/v1/object/{safe_bucket}/{safe_object}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type,
    }
    if method in {"POST", "PUT"}:
        headers["x-upsert"] = "true"
    if range_header:
        headers["Range"] = range_header
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=60) as response:
            body = response.read()
            return {
                "status": response.status,
                "headers": dict(response.headers.items()),
                "body": body,
            }
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase Storage request failed: {error.code} {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Supabase Storage request failed: {error.reason}") from error


def use_remote_video_server() -> bool:
    return bool(REMOTE_VIDEO_BASE_URL)


def remote_video_request(
    method: str,
    path: str,
    data: bytes | None = None,
    content_type: str = "application/octet-stream",
    range_header: str | None = None,
) -> dict:
    if not use_remote_video_server():
        raise RuntimeError("Remote video server is not configured")
    url = f"{REMOTE_VIDEO_BASE_URL}{path if path.startswith('/') else f'/{path}'}"
    headers = {"Accept": "application/json" if method != "GET" else "*/*"}
    if data is not None:
        headers["Content-Type"] = content_type
    if range_header:
        headers["Range"] = range_header
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=90) as response:
            return {
                "status": response.status,
                "headers": dict(response.headers.items()),
                "body": response.read(),
            }
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Remote video request failed: {error.code} {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Remote video request failed: {error.reason}") from error


def supabase_video_path(filename: str) -> str:
    clean_name = Path(filename).name
    return f"{SUPABASE_VIDEO_PREFIX}/{clean_name}" if SUPABASE_VIDEO_PREFIX else clean_name


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


def _video_payload(filename: str, mime_type: str, size: int, backend: str = "local") -> dict:
    return {
        "filename": filename,
        "mime_type": mime_type,
        "size": int(size),
        "backend": backend,
        "bucket": SUPABASE_VIDEO_BUCKET if backend == "supabase_storage" else None,
        "object_path": supabase_video_path(filename) if backend == "supabase_storage" else None,
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


def _delete_supabase_video(video: dict | None) -> None:
    if not use_supabase_storage():
        return
    object_path = (video or {}).get("object_path") or supabase_video_path((video or {}).get("filename", ""))
    if not object_path.strip("/"):
        return
    safe_bucket = quote(SUPABASE_VIDEO_BUCKET, safe="")
    url = f"{SUPABASE_URL}/storage/v1/object/{safe_bucket}"
    body = json.dumps({"prefixes": [object_path]}).encode("utf-8")
    request = Request(
        url,
        data=body,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        method="DELETE",
    )
    try:
        with urlopen(request, timeout=30) as response:
            response.read()
    except (HTTPError, URLError):
        # Deleting the database row should not fail just because an old video object is missing.
        return


def delete_video_asset(video: dict | None) -> None:
    if (video or {}).get("backend") == "supabase_storage":
        _delete_supabase_video(video)
        return
    _delete_video_file(video)


def upload_supabase_video(filename: str, data: bytes, mime_type: str) -> None:
    supabase_storage_request("PUT", supabase_video_path(filename), data=data, content_type=mime_type)


def read_supabase_video_asset(filename: str, range_header: str | None = None) -> dict | None:
    if not use_supabase_storage():
        return None
    try:
        response = supabase_storage_request("GET", supabase_video_path(filename), range_header=range_header)
    except RuntimeError:
        return None
    headers = response["headers"]
    return {
        "status": int(response["status"]),
        "content_type": headers.get("content-type") or headers.get("Content-Type") or mimetypes_guess_video_type(filename),
        "headers": {
            "Accept-Ranges": headers.get("accept-ranges") or headers.get("Accept-Ranges") or "bytes",
            "Content-Range": headers.get("content-range") or headers.get("Content-Range"),
            "Content-Length": headers.get("content-length") or headers.get("Content-Length") or str(len(response["body"])),
        },
        "body": response["body"],
    }


def read_remote_video_asset(filename: str, range_header: str | None = None, head_only: bool = False) -> dict | None:
    if not use_remote_video_server():
        return None
    clean_name = Path(filename).name
    if not clean_name:
        return None
    try:
        response = remote_video_request("HEAD" if head_only else "GET", f"/api/videos/{quote(clean_name)}", range_header=range_header)
    except RuntimeError:
        return None
    headers = response["headers"]
    return {
        "status": int(response["status"]),
        "content_type": headers.get("content-type") or headers.get("Content-Type") or mimetypes_guess_video_type(clean_name),
        "headers": {
            "Accept-Ranges": headers.get("accept-ranges") or headers.get("Accept-Ranges") or "bytes",
            "Content-Range": headers.get("content-range") or headers.get("Content-Range"),
            "Content-Length": headers.get("content-length") or headers.get("Content-Length") or str(len(response["body"])),
        },
        "body": response["body"],
    }


def mimetypes_guess_video_type(filename: str) -> str:
    import mimetypes

    return mimetypes.guess_type(filename)[0] or "video/webm"


def upload_remote_run_video(run_id: int, data: bytes, mime_type: str) -> dict | None:
    if not use_remote_video_server():
        return None
    response = remote_video_request("POST", f"/api/runs/{int(run_id)}/video", data=data, content_type=mime_type)
    raw_body = response["body"].decode("utf-8", errors="replace")
    payload = json.loads(raw_body) if raw_body else {}
    return payload.get("video")


def save_run_video(run_id: int, filename: str, mime_type: str, data: bytes) -> dict | None:
    if use_supabase_storage():
        upload_supabase_video(filename, data, mime_type)
        return attach_run_video(run_id, filename, mime_type, len(data), backend="supabase_storage")
    if use_remote_video_server():
        remote_video = upload_remote_run_video(run_id, data, mime_type)
        if remote_video:
            return remote_video
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    (VIDEO_DIR / filename).write_bytes(data)
    return attach_run_video(run_id, filename, mime_type, len(data), backend="local")


def attach_run_video(run_id: int, filename: str, mime_type: str, size: int, backend: str = "local") -> dict | None:
    if use_supabase():
        return supabase_attach_run_video(run_id, filename, mime_type, size, backend=backend)
    with connect() as conn:
        row = conn.execute("SELECT payload FROM runs WHERE id = ?", (run_id,)).fetchone()
        if not row:
            return None
        payload = json.loads(row["payload"])
        delete_video_asset(payload.get("video"))
        payload["video"] = _video_payload(filename, mime_type, size, backend=backend)
        conn.execute("UPDATE runs SET payload = ? WHERE id = ?", (json.dumps(payload, ensure_ascii=False), run_id))
        conn.commit()
        return payload["video"]


def list_runs(limit: int | None = None) -> list[dict]:
    if use_supabase():
        return supabase_list_runs(limit)
    with connect() as conn:
        params = ()
        limit_clause = ""
        if limit is not None:
            limit_clause = "LIMIT ?"
            params = (max(1, int(limit)),)
        rows = conn.execute(
            f"""
            SELECT id, created_at, liquid, terminal_velocity, viscosity, r2, re, score, source, payload
            FROM runs
            ORDER BY id DESC
            {limit_clause}
            """,
            params,
        ).fetchall()
    records = []
    for row in rows:
        record = dict(row)
        payload = json.loads(record.pop("payload"))
        student = payload.get("student") or {}
        video = payload.get("video") or {}
        record["has_student_measurement"] = bool(student.get("student_v") and student.get("student_eta"))
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
        delete_video_asset(json.loads(row["payload"]).get("video"))
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
            delete_video_asset(json.loads(row["payload"]).get("video"))
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


def supabase_attach_run_video(run_id: int, filename: str, mime_type: str, size: int, backend: str = "local") -> dict | None:
    row = supabase_get_row(run_id)
    if not row:
        return None
    payload = normalise_supabase_payload(row)
    delete_video_asset(payload.get("video"))
    payload["video"] = _video_payload(filename, mime_type, size, backend=backend)
    query = urlencode({"id": f"eq.{int(run_id)}"})
    supabase_request(
        "PATCH",
        f"{SUPABASE_TABLE}?{query}",
        {"payload": payload},
        headers={"Prefer": "return=minimal"},
    )
    return payload["video"]


def supabase_list_runs(limit: int | None = None) -> list[dict]:
    rows = []
    page_size = 1000
    remaining = max(1, int(limit)) if limit is not None else None
    offset = 0
    while True:
        batch_size = min(page_size, remaining) if remaining is not None else page_size
        query = urlencode({
            "select": "id,created_at,liquid,terminal_velocity,viscosity,r2,re,score,source,payload",
            "order": "id.desc",
            "limit": str(batch_size),
            "offset": str(offset),
        })
        batch = supabase_request("GET", f"{SUPABASE_TABLE}?{query}") or []
        rows.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size
        if remaining is not None:
            remaining -= len(batch)
            if remaining <= 0:
                break
    records = []
    for row in rows:
        payload = row.pop("payload") or {}
        if isinstance(payload, str):
            payload = json.loads(payload)
        student = payload.get("student") or {}
        video = payload.get("video") or {}
        row["has_student_measurement"] = bool(student.get("student_v") and student.get("student_eta"))
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
    delete_video_asset(normalise_supabase_payload(row).get("video"))
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
        delete_video_asset(normalise_supabase_payload(row).get("video"))
    return len(rows)


def supabase_latest_run() -> dict | None:
    query = urlencode({"select": "id,payload", "order": "id.desc", "limit": "1"})
    rows = supabase_request("GET", f"{SUPABASE_TABLE}?{query}") or []
    return normalise_supabase_payload(rows[0]) if rows else None


def build_report_text(run: dict) -> str:
    params = run.get("params") or {}
    result = run.get("result") or {}
    student = run.get("student") or {}
    diagnostics = run.get("diagnostics") or []
    quality = run.get("quality", {})
    preprocessing = quality.get("preprocessing", {})
    segment = run.get("segment") or {}
    frames = run.get("frames") or []
    curves = run.get("curves") or {}
    velocity_curve = curves.get("velocity") or []
    position_curve = curves.get("position") or []
    motion_phases = run.get("motion_phases") or []
    score = student.get("score")
    v_error = student.get("v_error")
    eta_error = student.get("eta_error")
    terminal_velocity = result.get("terminal_velocity")
    corrected_viscosity = result.get("viscosity")
    ideal_viscosity = result.get("ideal_viscosity", corrected_viscosity)
    relative_uncertainty = result.get("relative_uncertainty")
    report_time = run.get("created_at") or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    radius_mm = report_float(params.get("radius_mm"))
    tube_diameter_mm = report_float(params.get("tube_diameter_mm"))
    tube_ratio = (2 * radius_mm / tube_diameter_mm) if radius_mm and tube_diameter_mm else None
    frame_count = len(frames) or len(position_curve)
    velocity_count = len(velocity_curve)
    duration_s = report_duration(frames, position_curve)
    sampling_hz = ((frame_count - 1) / duration_s) if duration_s and frame_count > 1 else None
    total_drop_m = report_total_drop(frames, position_curve)
    segment_summary = describe_segment(segment, velocity_curve)
    transient = result.get("transient") or {}

    conclusion = report_conclusion(score, v_error, eta_error, result, quality)
    score_basis = [
        ("人工终端速度相对偏差", format_percent(v_error), "偏差越小，说明人工计时或人工选段越接近 AI 拟合结果。"),
        ("人工粘滞系数相对偏差", format_percent(eta_error), "偏差越小，说明人工理想公式计算结果与 AI 理想公式参考值越一致。"),
        ("AI 拟合 R²", format_report_value(result.get("r2"), "", 4), "越接近 1，匀速段线性越好。"),
        ("综合评分", format_report_value(score, "分", 0), "由人工偏差与 AI 拟合质量共同决定。"),
    ]
    lines = [
        "# 基于AI视觉的落球法液体粘滞系数智能测量系统实验报告",
        "",
        "本报告由平台根据本次实验的视觉追踪轨迹、人工填写结果、物理修正模型和质量诊断自动生成。报告用于帮助学生复盘实验过程，也可作为教师检查原始数据、选段质量、计算依据和误差来源的辅助材料。",
        "",
        "## 1. 实验目的与结论摘要",
        "| 项目 | 内容 |",
        "|---|---|",
        report_row("实验目的", "利用落球法测量待测液体粘滞系数，并比较人工理想公式计算结果与 AI 视觉测量结果。"),
        report_row("核心思路", "通过摄像头获得小球下落轨迹，经标定后转换为真实位移，识别稳定速度段，计算终端速度 vt，再由 Stokes 公式得到粘滞系数。"),
        report_row("本次结论", conclusion),
        report_row("评分口径", "学生填写的速度和粘滞系数与 AI 理想公式参考值比较；修正后粘滞系数用于实验复盘，不直接作为学生评分基准。"),
        "",
        "## 2. 实验记录与仪器参数",
        "| 项目 | 数值 | 说明 |",
        "|---|---:|---|",
        report_row("记录ID", run.get("id", "-"), "平台自动保存的实验编号。"),
        report_row("日期时间", report_time, "本次记录生成或保存时间。"),
        report_row("数据来源", source_label(run.get("source")), "实时追踪、视频追踪或仿真记录。"),
        report_row("液体种类", params.get("liquid", "-"), "由学生在 AI 实验页面选择或填写。"),
        report_row("液体温度", format_report_value(params.get("temperature_c"), "℃", 1), "用于匹配最接近温度的参考粘度数据。"),
        report_row("液体密度", format_report_value(params.get("rho_liquid"), "kg/m³", 1), "参与浮力项计算。"),
        report_row("小球半径 r", format_report_value(params.get("radius_mm"), "mm", 3), "平台计算时使用半径；若人工测得直径，应先除以 2。"),
        report_row("小球直径 2r", format_report_value(2 * radius_mm if radius_mm is not None else None, "mm", 3), "与量筒内径共同决定壁效应强弱。"),
        report_row("小球密度", format_report_value(params.get("rho_ball"), "kg/m³", 1), "默认按钢球密度，可按实际材料修正。"),
        report_row("量筒内径 D", format_report_value(params.get("tube_diameter_mm"), "mm", 2), "注意这里是内径，不是半径。"),
        report_row("液体深度 H", format_report_value(params.get("liquid_depth_mm"), "mm", 1), "参与壁面深度修正和实验可行性判断。"),
        report_row("小球直径/量筒内径 2r/D", format_report_value(tube_ratio, "", 4), "越小越接近无限大容器假设；过大时壁效应明显。"),
        "",
        "## 3. 实验原理与计算公式",
        "| 计算环节 | 公式或方法 | 在本平台中的作用 |",
        "|---|---|---|",
        report_row("终端速度", "vt 由稳定平台段位移-时间曲线斜率得到", "AI 先识别候选匀速段，再对该段 y-t 数据做稳健线性拟合。"),
        report_row("理想 Stokes 公式", "η0 = 2r²(ρ球-ρ液)g / (9vt)", "这是学生人工计算和平台评分采用的理想粘滞系数。"),
        report_row("壁效应修正", "K壁 = (1 + 2.4r/R)(1 + 3.3r/H)", "R 为量筒半径，H 为液体深度；用于复盘液体边界对速度的影响。"),
        report_row("雷诺数", "Re = ρ液 vt 2r / η", "判断 Stokes 流动条件是否满足；Re 越小，低雷诺数假设越可靠。"),
        report_row("雷诺数二级修正", "KRe = 1 + 3Re/16 - 19Re²/1080", "当 Re 在适用范围内时参与迭代修正；Re 过高时平台会提示模型风险。"),
        report_row("修正后粘滞系数", "η = η0 / (K壁 KRe)", "用于 AI 实验复盘和物理模型解释，不替代学生理想公式评分。"),
        report_row("合成不确定度", "uη/η 按直径、时间、距离、容器、液深和标定点误差传播", "平台页面中的不确定度卡片用于展示 η ± U；报告同时记录 AI 轨迹拟合相对不确定度。"),
        "",
        "## 4. AI视觉测量流程",
        "| 步骤 | 平台处理 | 质量关注点 |",
        "|---|---|---|",
        report_row("1. 获取画面", "连接实时画面或载入实验视频，画面中应尽量包含完整下落区间。", "曝光、对焦、背景对比度会直接影响小球识别。"),
        report_row("2. 标定尺度", "使用标定棒上的已知长度，把像素坐标转换为实际位移。", "鼠标标点误差会进入距离标定不确定度。"),
        report_row("3. 追踪小球", "逐帧检测小球中心，形成 t-y 轨迹。", "若出现反光、遮挡、气泡或小球偏离量筒中心，轨迹会抖动。"),
        report_row("4. 清洗轨迹", "剔除无效点和明显异常点，对保留点估计速度。", "异常点过多说明检测条件需要重新调整。"),
        report_row("5. 识别平台段", "扫描多个候选时间窗口，综合速度离散度、斜率、置信度和位置因素选择稳定区间。", "平台段应尽量靠后且速度波动小。"),
        report_row("6. 计算与评分", "输出 vt、η0、修正η、Re、K壁、KRe，并与学生填写结果比较。", "评分只使用 AI 理想参考值与学生理想公式结果的偏差。"),
        "",
        "## 5. 轨迹数据质量",
        "| 指标 | 本次结果 | 解读 |",
        "|---|---:|---|",
        report_row("有效位置点数", frame_count, "用于拟合 y-t 曲线的轨迹点数量。"),
        report_row("速度采样点数", velocity_count, "由相邻或跨帧位置点估计得到。"),
        report_row("记录时长", format_report_value(duration_s, "s", 3), "覆盖下落过程越完整，越有利于识别加速段和匀速段。"),
        report_row("总下落距离", format_report_value(total_drop_m, "m", 4), "由轨迹起止位置估算，仅作为覆盖范围参考。"),
        report_row("估算采样频率", format_report_value(sampling_hz, "Hz", 1), "采样频率越高，速度曲线细节越充分，但过高会增加曲线刷新压力。"),
        report_row("中位采样间隔", format_report_value(preprocessing.get("median_dt"), "s", 4), "反映帧间时间是否稳定。"),
        report_row("无效点数量", int(preprocessing.get("dropped_points", 0) or 0), "无法形成可靠位置或时间戳的点。"),
        report_row("异常点数量", int(preprocessing.get("outlier_points", 0) or 0), "被平台识别为明显偏离轨迹趋势的点。"),
        report_row("拟合方法", quality.get("fit_method", "-"), "平台根据数据质量选择稳健拟合方法。"),
        report_row("拟合点数", quality.get("fit_point_count", "-"), "最终用于终端速度线性拟合的点数。"),
        report_row("拟合 RMSE", format_report_value(quality.get("fit_rmse"), "m", 6), "位置拟合残差，越小表示线性平台段越稳定。"),
        report_row("斜率标准误", format_report_value(quality.get("terminal_velocity_stderr"), "m/s", 6), "终端速度拟合不确定性的一个来源。"),
        report_row("平均追踪置信度", format_percent(result.get("tracking_confidence")), "越高说明视觉识别越可靠。"),
        "",
        "## 6. 匀速段与运动阶段分析",
        "平台不会简单地把中间一段默认视为匀速段，而是在速度曲线中扫描多个候选窗口。候选窗口会同时比较速度波动、整体斜率、追踪置信度、区间长度以及位置是否过早；因此最终选段可能位于中后段，也可能在后段受到底部反光、出视野或气泡影响时避开末尾。",
        "",
        "| 匀速段指标 | 本次结果 | 说明 |",
        "|---|---:|---|",
        report_row("速度点范围", segment_summary["index_range"], "平台选中的速度曲线索引范围。"),
        report_row("时间范围", segment_summary["time_range"], "用于终端速度拟合的主要时间区间。"),
        report_row("持续时间", format_report_value(segment_summary["duration_s"], "s", 3), "区间越长，通常越有利于降低偶然波动。"),
        report_row("窗口点数", segment.get("window_size", "-"), "候选平台段包含的速度点数量。"),
        report_row("速度离散度 CV", format_report_value(segment.get("cv"), "", 4), "越低越接近匀速；过高时应复核追踪和选段。"),
        report_row("选段得分", format_report_value(segment.get("score"), "", 4), "平台内部用于排序候选平台段的综合指标，越低越稳定。"),
        report_row("选段平均置信度", format_percent(segment.get("avg_confidence")), "该平台段内小球识别的平均可靠性。"),
        report_row("选段中心位置", format_percent(segment.get("center_ratio")), "反映平台段处于整段下落曲线的大致位置。"),
        "",
        "| 阶段 | 趋势 | 时间范围 | 持续时间 | 位移 | 速度变化 | 离散度 | 说明 |",
        "|---|---|---:|---:|---:|---:|---:|---|",
    ]
    lines.extend(report_motion_phase_rows(motion_phases))
    lines.extend([
        "",
        "## 7. 结果对比与评分",
        "| 指标 | 人工测量值 | AI理想参考值 | 相对偏差 | 备注 |",
        "|---|---:|---:|---:|---|",
        report_compare_row("终端速度 vt", student.get("student_v"), terminal_velocity, "m/s", student.get("v_error")),
        report_compare_row("理想公式粘滞系数 η₀", student.get("student_eta"), ideal_viscosity, "Pa·s", student.get("eta_error")),
        report_row("修正后粘滞系数 η", "-", format_report_value(corrected_viscosity, "Pa·s", 6), "-", "计入壁效应和 Re 修正后的复盘参考值，不用于学生理想公式评分"),
        report_row("参考表值 η表", "-", format_report_value(params.get("eta_reference"), "Pa·s", 6), "-", "由液体和温度匹配得到的参考值，仅作为实验合理性对照"),
        report_row("线性拟合 R²", "-", format_report_value(result.get("r2"), "", 4), "-", "匀速段线性拟合质量"),
        report_row("Re", "-", format_report_value(result.get("re"), "", 4), "-", "Stokes 适用条件判据"),
        report_row("壁效应修正因子 K壁", "-", format_report_value(result.get("wall_correction"), "", 4), "-", "由小球半径、量筒内径和液体深度决定"),
        report_row("雷诺数修正因子 KRe", "-", format_report_value(result.get("reynolds_correction"), "", 4), "-", "Re 适用范围内参与二级修正"),
        report_row("总修正因子 K壁KRe", "-", format_report_value(result.get("correction_total"), "", 4), "-", "修正后 η = η0 / 总修正因子"),
        report_row("AI相对不确定度", "-", format_percent(relative_uncertainty), "-", "由轨迹拟合波动等因素估计，用于报告复盘"),
        report_row("追踪平均置信度", "-", format_percent(result.get("tracking_confidence")), "-", "AI 视觉追踪质量"),
        "",
        "## 8. 评分结果以及依据",
        "| 项目 | 结果 | 评分依据 |",
        "|---|---:|---|",
    ])
    lines.extend(f"| {label} | {value} | {basis} |" for label, value, basis in score_basis)
    lines.extend([
        "",
        "评分公式说明：综合评分会扣除人工终端速度偏差、人工理想粘滞系数偏差以及 AI 匀速段线性拟合不足带来的影响。平台评分上限和下限做了限制，目的是避免一次极端误差让学生失去复盘价值，同时保留区分度。",
        "",
        "## 9. 瞬态拟合复核",
        "| 项目 | 结果 | 说明 |",
        "|---|---:|---|",
        report_row("是否可用", "可用" if transient.get("available") else "不可用", "入液加速或减速段对噪声、初始释放和标定误差非常敏感，因此只作为探索性复核，不参与主评分。"),
        report_row("瞬态粘滞系数", format_report_value(transient.get("viscosity"), "Pa·s", 6), "若与匀速段结果差异过大，应以匀速段主结果为准。"),
        report_row("瞬态拟合 R²", format_report_value(transient.get("r2"), "", 4), "越接近 1，说明指数趋近模型越能解释入液初段速度变化。"),
        report_row("时间常数 τ", format_report_value(transient.get("tau"), "s", 4), "反映速度接近终端速度的快慢。"),
        report_row("状态说明", transient.get("reason") or transient.get("message") or "本项为辅助分析。", "用于判断为何可用或不可用。"),
        "",
        "## 10. 不确定度与误差来源",
        "| 类型 | 指标或现象 | 分析 |",
        "|---|---|---|",
        f"| 人工测量误差 | vt 偏差 {format_percent(v_error)}；η₀ 偏差 {format_percent(eta_error)} | 若偏差较大，优先检查人工计时、人工选段、读数反应延迟和理想公式单位换算。 |",
        report_row("AI拟合误差", f"R²={format_report_value(result.get('r2'), '', 4)}；匀速段 CV={format_report_value(quality.get('uniform_segment_cv'), '', 4)}", "R² 偏低或速度离散度偏大时，说明匀速段不稳定或轨迹噪声较大。"),
        report_row("视觉追踪误差", f"平均置信度 {format_percent(result.get('tracking_confidence'))}；异常点 {int(preprocessing.get('outlier_points', 0) or 0)}；无效点 {int(preprocessing.get('dropped_points', 0) or 0)}", "气泡、划痕、阴影、曝光过高、背景过暗或检测区域过大都可能造成误识别。"),
        report_row("标定误差", "标定棒点选误差会改变像素到真实距离的换算比例", "这是 AI 改进测量引入的主要附加不确定度之一，建议放大标定画面后再点选标记。"),
        report_row("对焦与景深误差", "焦点偏离小球运动平面会使边缘模糊", "应锁定曝光和对焦，使小球所在平面清晰；必要时提高照明和背景对比度。"),
        report_row("选段范围误差", f"平台段持续 {format_report_value(segment_summary['duration_s'], 's', 3)}", "选段过短或过早会放大小球尚未稳定、局部反光或速度抖动带来的影响。"),
        report_row("物理模型误差", f"Re={format_report_value(result.get('re'), '', 4)}；K壁={format_report_value(result.get('wall_correction'), '', 4)}", "Re 偏高或壁效应修正较大时，Stokes 条件偏离更明显。"),
        "",
        "## 11. 平台诊断与改进建议",
        "| 等级 | 诊断项 | 建议 |",
        "|---|---|---|",
    ])
    for item in diagnostics:
        lines.append(report_row(item.get("level", "-"), item.get("title", "-"), item.get("message", "-")))
    lines.extend([
        "",
        "## 12. 报告结论",
        conclusion,
        "",
        "建议保存本报告、原始视频和实验记录编号，便于后续对同一液体在不同温度、不同小球半径或不同标定方式下进行横向比较。若发现末端速度明显下降，应优先检查量筒底部反光、ROI边界、标定是否覆盖整个观察区间以及小球是否偏离量筒中心。",
    ])
    lines.append("")
    lines.append("说明：评分报告用于辅助复盘，不替代原始实验记录。最终结论仍应结合释放质量、标定质量、背光条件、人工测量过程和 Stokes 适用条件综合判断。")
    return "\n".join(lines)


def report_float(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def report_row(*cells) -> str:
    return "| " + " | ".join(report_cell(cell) for cell in cells) + " |"


def report_cell(value) -> str:
    if value is None:
        return "未填写"
    text = str(value).replace("\n", " ").strip()
    return text.replace("|", "／") if text else "-"


def source_label(source) -> str:
    labels = {
        "simulation": "虚拟仿真",
        "camera": "摄像机视频",
        "video": "摄像机视频",
        "csv": "轨迹CSV",
        "live": "实时追踪",
        "realtime": "实时追踪",
        "live_frame_preview": "实时画面预览",
    }
    key = str(source or "").strip()
    return labels.get(key, key or "-")


def report_duration(frames: list[dict], position_curve: list[dict]) -> float | None:
    points = frames or position_curve
    if len(points) < 2:
        return None
    start = report_float(points[0].get("t"))
    end = report_float(points[-1].get("t"))
    if start is None or end is None or end <= start:
        return None
    return end - start


def report_total_drop(frames: list[dict], position_curve: list[dict]) -> float | None:
    points = frames or position_curve
    if len(points) < 2:
        return None
    start = report_float(points[0].get("corrected_y", points[0].get("y")))
    end = report_float(points[-1].get("corrected_y", points[-1].get("y")))
    if start is None or end is None:
        return None
    return end - start


def describe_segment(segment: dict, velocity_curve: list[dict]) -> dict:
    start = int(segment.get("start", 0) or 0)
    end = int(segment.get("end", start) or start)
    if not velocity_curve:
        return {"index_range": "-", "time_range": "-", "duration_s": None}
    max_index = max(0, len(velocity_curve) - 1)
    start = max(0, min(start, max_index))
    end = max(start, min(end, max_index))
    start_t = report_float(velocity_curve[start].get("t"))
    end_t = report_float(velocity_curve[end].get("t"))
    duration = (end_t - start_t) if start_t is not None and end_t is not None and end_t >= start_t else None
    return {
        "index_range": f"{start} - {end}",
        "time_range": f"{format_report_value(start_t, 's', 3)} 至 {format_report_value(end_t, 's', 3)}",
        "duration_s": duration,
    }


def report_motion_phase_rows(phases: list[dict]) -> list[str]:
    if not phases:
        return [report_row("未生成", "-", "-", "-", "-", "-", "-", "本次记录缺少足够速度点，暂未形成阶段判断。")]
    rows = []
    for phase in phases:
        start_t = phase.get("start_time")
        end_t = phase.get("end_time")
        rows.append(
            report_row(
                phase.get("label", "-"),
                phase_trend_label(phase.get("trend")),
                f"{format_report_value(start_t, 's', 3)} 至 {format_report_value(end_t, 's', 3)}",
                format_report_value(phase.get("time_s"), "s", 3),
                format_report_value(phase.get("distance_m"), "m", 4),
                format_report_value(phase.get("delta_v"), "m/s", 4),
                format_report_value(phase.get("cv"), "", 4),
                phase.get("description", "-"),
            )
        )
    return rows


def phase_trend_label(trend) -> str:
    return {
        "accelerating": "加速",
        "decelerating": "减速",
        "stable": "稳定",
    }.get(str(trend or ""), str(trend or "-"))


def report_conclusion(score, v_error, eta_error, result: dict, quality: dict) -> str:
    score_value = report_float(score)
    r2 = report_float(result.get("r2"))
    confidence = report_float(result.get("tracking_confidence"))
    cv = report_float(quality.get("uniform_segment_cv"))
    fragments = []
    if score_value is not None:
        if score_value >= 90:
            fragments.append("人工测量结果与 AI 理想参考结果高度一致")
        elif score_value >= 75:
            fragments.append("人工测量结果与 AI 参考结果基本一致，但仍有可复核空间")
        else:
            fragments.append("人工结果与 AI 参考结果偏差较明显，建议复查人工选段、计时和单位换算")
    if r2 is not None:
        fragments.append(f"匀速段线性拟合 R²={r2:.4f}")
    if confidence is not None:
        fragments.append(f"视觉平均置信度为 {confidence * 100:.1f}%")
    if cv is not None:
        fragments.append(f"平台段速度离散度 CV={cv:.4f}")
    if v_error is not None and eta_error is not None:
        fragments.append(f"速度偏差 {float(v_error) * 100:.2f}%，理想粘滞系数偏差 {float(eta_error) * 100:.2f}%")
    return "；".join(fragments) + "。" if fragments else "本次报告已生成，但缺少部分评分或拟合字段，建议先确认实验记录是否完整。"


def report_compare_row(label: str, student_value, ai_value, unit: str, relative_error) -> str:
    return (
        f"| {label} | {format_report_value(student_value, unit, 6)} | "
        f"{format_report_value(ai_value, unit, 6)} | {format_percent(relative_error)} | 人工输入与 AI 参考结果对比 |"
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
