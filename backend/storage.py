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
    params = run["params"]
    result = run["result"]
    student = run["student"]
    diagnostics = run["diagnostics"]
    quality = run.get("quality", {})
    preprocessing = quality.get("preprocessing", {})
    score = student.get("score")
    v_error = student.get("v_error")
    eta_error = student.get("eta_error")
    ideal_viscosity = result.get("ideal_viscosity", result["viscosity"])
    report_time = run.get("created_at") or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    score_basis = [
        ("人工终端速度相对偏差", format_percent(v_error), "偏差越小，说明人工计时或人工选段越接近 AI 拟合结果。"),
        ("人工粘滞系数相对偏差", format_percent(eta_error), "偏差越小，说明人工理想公式计算结果与 AI 理想公式参考值越一致。"),
        ("AI 拟合 R²", f"{float(result['r2']):.4f}", "越接近 1，匀速段线性越好。"),
        ("综合评分", format_report_value(score, "分", 0), "由人工偏差与 AI 拟合质量共同决定。"),
    ]
    lines = [
        "# 基于AI视觉的落球法液体粘滞系数智能测量系统实验报告",
        "",
        "## 1. 基本信息",
        "| 项目 | 数值 |",
        "|---|---|",
        f"| 记录ID | {run.get('id', '-')} |",
        f"| 日期时间 | {report_time} |",
        f"| 液体种类 | {params['liquid']} |",
        f"| 液体温度 | {params['temperature_c']} ℃ |",
        f"| 液体密度 | {params['rho_liquid']} kg/m³ |",
        f"| 小球半径 | {params['radius_mm']} mm |",
        f"| 小球密度 | {params['rho_ball']} kg/m³ |",
        f"| 量筒内径 | {params['tube_diameter_mm']} mm |",
        f"| 液体深度 | {params.get('liquid_depth_mm', '-')} mm |",
        f"| 数据来源 | {run.get('source', '-')} |",
        "",
        "## 2. 数据对比表",
        "| 指标 | 人工测量值 | AI理想参考值 | 相对偏差 | 备注 |",
        "|---|---:|---:|---:|---|",
        report_compare_row("终端速度 vt", student.get("student_v"), result["terminal_velocity"], "m/s", student.get("v_error")),
        report_compare_row("理想公式粘滞系数 η₀", student.get("student_eta"), ideal_viscosity, "Pa·s", student.get("eta_error")),
        f"| 修正后粘滞系数 η | - | {format_report_value(result['viscosity'], 'Pa·s', 6)} | - | 计入壁效应和 Re 修正后的复盘参考值，不用于学生理想公式评分 |",
        f"| 线性拟合 R² | - | {float(result['r2']):.4f} | - | 匀速段线性拟合质量 |",
        f"| Re | - | {float(result['re']):.4f} | - | Stokes 适用条件判据 |",
        f"| 壁效应修正因子 K壁 | - | {float(result['wall_correction']):.4f} | - | 由小球半径、量筒内径和液体深度决定 |",
        f"| 追踪平均置信度 | - | {float(result['tracking_confidence']) * 100:.1f}% | - | AI 视觉追踪质量 |",
        "",
        "## 3. 评分结果以及依据",
        "| 项目 | 结果 | 评分依据 |",
        "|---|---:|---|",
    ]
    lines.extend(f"| {label} | {value} | {basis} |" for label, value, basis in score_basis)
    lines.extend([
        "",
        "## 4. 误差分析",
        "| 类型 | 指标或现象 | 分析 |",
        "|---|---|---|",
        f"| 人工测量误差 | vt 偏差 {format_percent(v_error)}；η₀ 偏差 {format_percent(eta_error)} | 若偏差较大，优先检查人工计时、人工选段、读数反应延迟和理想公式单位换算。 |",
        f"| AI拟合误差 | R²={float(result['r2']):.4f}；匀速段速度离散度={float(quality.get('uniform_segment_cv', 0)):.4f} | R² 偏低或速度离散度偏大时，说明匀速段不稳定或轨迹噪声较大。 |",
        f"| 视觉追踪误差 | 平均置信度 {float(result['tracking_confidence']) * 100:.1f}%；降权坏点 {int(preprocessing.get('outlier_points', 0) or 0)}；无效点 {int(preprocessing.get('dropped_points', 0) or 0)} | 气泡、划痕、阴影、曝光过高或检测区域过大都可能造成误识别。 |",
        f"| 物理模型误差 | Re={float(result['re']):.4f}；K壁={float(result['wall_correction']):.4f} | Re 偏高或壁效应修正较大时，Stokes 条件偏离更明显。 |",
        "",
        "## 5. 改进建议",
        "| 等级 | 诊断项 | 建议 |",
        "|---|---|---|",
    ])
    for item in diagnostics:
        lines.append(f"| {item['level']} | {item['title']} | {item['message']} |")
    lines.append("")
    lines.append("说明：评分报告用于辅助复盘，不替代原始实验记录。最终结论仍应结合释放质量、标定质量、背光条件、人工测量过程和 Stokes 适用条件综合判断。")
    return "\n".join(lines)


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
