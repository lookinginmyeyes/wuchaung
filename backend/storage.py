import json
import math
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


def get_runs(run_ids: list[int] | tuple[int, ...]) -> list[dict]:
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
        return []
    if use_supabase():
        return supabase_get_runs(clean_ids)
    placeholders = ",".join("?" for _ in clean_ids)
    with connect() as conn:
        rows = conn.execute(f"SELECT id, payload FROM runs WHERE id IN ({placeholders})", clean_ids).fetchall()
    runs = []
    for row in rows:
        payload = json.loads(row["payload"])
        payload["id"] = row["id"]
        runs.append(payload)
    runs.sort(key=lambda item: clean_ids.index(int(item.get("id") or 0)) if int(item.get("id") or 0) in clean_ids else len(clean_ids))
    return runs


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


def supabase_get_runs(run_ids: list[int]) -> list[dict]:
    clean_ids = sorted(set(int(item) for item in run_ids if int(item) > 0))
    if not clean_ids:
        return []
    id_filter = f"in.({','.join(str(item) for item in clean_ids)})"
    query = urlencode({"id": id_filter, "select": "id,payload"})
    rows = supabase_request("GET", f"{SUPABASE_TABLE}?{query}") or []
    runs = [normalise_supabase_payload(row) for row in rows]
    runs.sort(key=lambda item: clean_ids.index(int(item.get("id") or 0)) if int(item.get("id") or 0) in clean_ids else len(clean_ids))
    return runs


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


def build_summary_report_text(runs: list[dict]) -> str:
    records = [run for run in runs if isinstance(run, dict)]
    records.sort(key=lambda item: int(item.get("id") or 0))
    metrics = [summary_metrics(run) for run in records]
    valid = [item for item in metrics if item.get("terminal_velocity") is not None]
    report_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ids = [str(item.get("id")) for item in metrics if item.get("id") is not None]
    liquids = sorted({str(item.get("liquid") or "-") for item in metrics})
    video_count = sum(1 for run in records if (run.get("video") or {}).get("url"))
    student_count = sum(1 for item in metrics if item.get("student_eta") is not None and item.get("student_v") is not None)
    re_values = [item["re"] for item in valid if item.get("re") is not None]
    re_low = sum(1 for value in re_values if value < 0.1)
    re_ok = sum(1 for value in re_values if value < 1)
    re_risky = sum(1 for value in re_values if value >= 1)
    quality_flags = summary_quality_flags(metrics)

    lines = [
        "# 落球法 AI 视觉测量多次实验汇总报告",
        "",
        "本报告由平台根据复盘页面勾选的多条实验记录自动生成，用于比较重复实验的一致性、人工测量与 AI 视觉测量的差异、物理模型适用条件以及数据质量。报告中的 AI 理想粘滞系数 η₀ 仍采用理想 Stokes 公式；修正粘滞系数 η 用于解释壁效应和雷诺数修正，不替代学生人工理想公式评分。",
        "",
        "## 1. 汇总范围",
        "| 项目 | 内容 |",
        "|---|---|",
        report_row("生成时间", report_time),
        report_row("勾选记录数", f"{len(records)} 条"),
        report_row("有效分析记录", f"{len(valid)} 条"),
        report_row("记录 ID", ", ".join(ids) if ids else "-"),
        report_row("液体种类", "、".join(liquids) if liquids else "-"),
        report_row("含人工测量", f"{student_count}/{len(records)} 条"),
        report_row("含录像归档", f"{video_count}/{len(records)} 条"),
        "",
        "## 2. 总体结论",
        summary_conclusion(metrics),
        "",
        "## 3. 实验记录明细",
        "| ID | 时间 | 液体 | 温度 | vt_AI | η₀_AI | η_修正 | AI相对u | U(η,k=2) | Re | R² | 置信度 | CV | 人工η偏差 | 分数 |",
        "|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    lines.extend(summary_detail_row(item) for item in metrics)
    lines.extend([
        "",
        "## 4. 重复性与离散程度统计",
        "| 指标 | 有效数 | 平均值 | 标准差 | RSD | 最小值 | 最大值 | 解读 |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
        summary_stat_row("AI终端速度 vt", metrics, "terminal_velocity", "m/s", 5, "反映小球稳定下落速度的一致性。"),
        summary_stat_row("AI理想粘滞系数 η₀", metrics, "ideal_viscosity", "Pa·s", 6, "用于与学生理想公式计算结果比较，是评分参考。"),
        summary_stat_row("修正粘滞系数 η", metrics, "corrected_viscosity", "Pa·s", 6, "计入壁效应和 Re 修正后，用于模型复盘。"),
        summary_stat_row("人工粘滞系数", metrics, "student_eta", "Pa·s", 6, "反映学生人工测量和计算结果的重复性。"),
        summary_stat_row("人工η相对偏差", metrics, "eta_error", "", 4, "越低说明人工理想公式结果越接近 AI 理想参考。", percent=True),
        summary_stat_row("AI拟合相对不确定度", metrics, "ai_relative_uncertainty", "", 4, "由轨迹速度波动、拟合标准误等保存结果估计，反映 AI 视觉测量自身波动。", percent=True),
        summary_stat_row("合成相对不确定度", metrics, "propagated_relative_uncertainty", "", 4, "按平台默认最小分度、匀速段距离/时间和标定点误差传播得到。", percent=True),
        summary_stat_row("标准不确定度 u(η)", metrics, "propagated_standard_uncertainty", "Pa·s", 6, "由修正粘滞系数乘以合成相对不确定度得到。"),
        summary_stat_row("扩展不确定度 U(η,k=2)", metrics, "propagated_expanded_uncertainty", "Pa·s", 6, "按 k=2 给出的报告用不确定度区间。"),
        summary_stat_row("Re", metrics, "re", "", 4, "用于判断 Stokes 低雷诺数假设是否可靠。"),
        summary_stat_row("R²", metrics, "r2", "", 4, "越接近 1，说明匀速段线性拟合越好。"),
        summary_stat_row("追踪置信度", metrics, "tracking_confidence", "", 4, "越高说明 AI 视觉追踪越稳定。", percent=True),
        summary_stat_row("匀速段 CV", metrics, "uniform_cv", "", 4, "越低说明平台段速度越稳定。"),
        summary_stat_row("综合评分", metrics, "score", "分", 1, "综合反映人工结果偏差和 AI 拟合质量。"),
        "",
        "## 5. 按液体与温度分组",
        "| 分组 | 记录数 | vt均值 | η₀均值 | η₀标准差 | η₀ RSD | Re均值 | 评分均值 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ])
    lines.extend(summary_group_rows(metrics))
    lines.extend([
        "",
        "## 6. 模型适用性分析",
        "| 判据 | 统计结果 | 说明 |",
        "|---|---:|---|",
        report_row("Re < 0.1", f"{re_low}/{len(re_values)}", "更接近蠕动流条件，Stokes 理想模型更可靠。"),
        report_row("Re < 1", f"{re_ok}/{len(re_values)}", "教学实验常用低雷诺数判据。"),
        report_row("Re ≥ 1", f"{re_risky}/{len(re_values)}", "惯性影响增强，建议更换更小小球、更高粘度液体或降低速度。"),
        report_row("2r/D 平均值", summary_stat_text(metrics, "tube_ratio", "", 4), "小球直径与量筒内径之比，越小壁效应越弱。"),
        report_row("K壁 平均值", summary_stat_text(metrics, "wall_correction", "", 4), "越接近 1，容器边界修正越小。"),
        report_row("KRe 平均值", summary_stat_text(metrics, "reynolds_correction", "", 4), "越接近 1，雷诺数修正越小。"),
        "",
        "## 7. 数据质量分析",
        "| 指标 | 汇总结果 | 说明 |",
        "|---|---:|---|",
        report_row("平均追踪置信度", summary_stat_text(metrics, "tracking_confidence", "", 4, percent=True), "若偏低，优先检查背光、对焦、反光和小球颜色对比度。"),
        report_row("AI拟合相对不确定度", summary_stat_text(metrics, "ai_relative_uncertainty", "", 4, percent=True), "由平台后端随实验记录保存，主要反映速度拟合波动。"),
        report_row("合成相对不确定度", summary_stat_text(metrics, "propagated_relative_uncertainty", "", 4, percent=True), "按默认最小分度传播，包含直径、时间、距离、量筒内径、液体深度和标定点误差。"),
        report_row("平均扩展不确定度 U", summary_stat_text(metrics, "propagated_expanded_uncertainty", "Pa·s", 6), "用于表达 η ± U，覆盖因子 k=2。"),
        report_row("平均异常点数", summary_stat_text(metrics, "outlier_points", "个", 1), "异常点多时，速度曲线会出现尖峰或匀速段抖动。"),
        report_row("平均无效点数", summary_stat_text(metrics, "dropped_points", "个", 1), "无效点多通常说明画面识别不稳定或小球离开 ROI。"),
        report_row("平均匀速段持续时间", summary_stat_text(metrics, "segment_duration", "s", 3), "平台段越长，终端速度拟合越抗偶然误差。"),
        report_row("需重点复查记录", "、".join(quality_flags) if quality_flags else "无明显高风险记录", "由低 R²、高 CV、低置信度、Re 偏高或人工偏差过大综合筛选。"),
        "",
        "## 8. 人工测量与 AI 测量对比",
        "| 对比项 | 汇总结果 | 教学意义 |",
        "|---|---:|---|",
        report_row("人工 vt 相对偏差", summary_stat_text(metrics, "v_error", "", 4, percent=True), "反映人工计时、人工选段和读数反应误差。"),
        report_row("人工 η₀ 相对偏差", summary_stat_text(metrics, "eta_error", "", 4, percent=True), "反映人工理想公式计算结果与 AI 理想参考的一致性。"),
        report_row("人工结果完整率", f"{student_count}/{len(records)}", "若缺少人工值，说明学生还没有完成独立测量与计算环节。"),
        "",
        "## 9. AI实验不确定度说明",
        "| 不确定度来源 | 平台默认取值或计算方式 | 进入报告的方式 |",
        "|---|---|---|",
        report_row("小球直径 d", "Δd=0.01 mm", "按游标卡尺最小分度估计，进入直径相关项。"),
        report_row("量筒内径 D", "ΔD=0.01 mm", "按游标卡尺最小分度估计，进入壁面修正相关项。"),
        report_row("液体深度 H", "ΔH=5 mm", "按 1 cm 刻度直尺的半分度估计，进入液深修正项。"),
        report_row("匀速段时间 t", "Δt=0.02 s", "考虑视频帧间隔、选段边界和人工复核误差。"),
        report_row("匀速段距离 l", "Δl=1.0 mm", "考虑标定后距离读数与曲线选段误差。"),
        report_row("标定点误差", "Δl标定=0.5 mm", "由鼠标点击标定棒刻度点引入，是 AI 视觉测量新增的不确定度项。"),
        report_row("扩展不确定度", "U=2u", "报告中默认按 k=2 给出 η ± U。"),
        "",
        "## 10. 综合改进建议",
    ])
    lines.extend(summary_advice(metrics))
    lines.extend([
        "",
        "## 11. 报告使用说明",
        "这份多次实验报告适合放在实验复盘、研究报告或答辩材料中，用于说明平台不仅能给出单次结果，还能对多次重复实验进行统计分析。正式提交前建议保留原始视频、实验记录 ID 和单次报告，便于追溯每个统计值来自哪一次实验。",
    ])
    return "\n".join(lines)


def report_float(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def summary_metrics(run: dict) -> dict:
    params = run.get("params") or {}
    result = run.get("result") or {}
    student = run.get("student") or {}
    quality = run.get("quality") or {}
    preprocessing = quality.get("preprocessing") or {}
    segment = run.get("segment") or {}
    velocity_curve = (run.get("curves") or {}).get("velocity") or []
    segment_summary = describe_segment(segment, velocity_curve)
    radius_mm = report_float(params.get("radius_mm"))
    tube_diameter_mm = report_float(params.get("tube_diameter_mm"))
    corrected = report_float(result.get("viscosity"))
    ideal = report_float(result.get("ideal_viscosity"))
    if ideal is None:
        ideal = corrected
    ai_relative_uncertainty = report_float(result.get("relative_uncertainty"))
    propagated_uncertainty = summary_propagated_uncertainty(run, corrected)
    return {
        "id": run.get("id"),
        "created_at": run.get("created_at") or "-",
        "source": run.get("source"),
        "liquid": params.get("liquid") or "-",
        "temperature_c": report_float(params.get("temperature_c")),
        "radius_mm": radius_mm,
        "tube_diameter_mm": tube_diameter_mm,
        "tube_ratio": (2 * radius_mm / tube_diameter_mm) if radius_mm and tube_diameter_mm else None,
        "terminal_velocity": report_float(result.get("terminal_velocity")),
        "ideal_viscosity": ideal,
        "corrected_viscosity": corrected,
        "ai_relative_uncertainty": ai_relative_uncertainty,
        "ai_standard_uncertainty": (ideal * ai_relative_uncertainty) if ideal is not None and ai_relative_uncertainty is not None else None,
        "ai_expanded_uncertainty": (2 * ideal * ai_relative_uncertainty) if ideal is not None and ai_relative_uncertainty is not None else None,
        "propagated_relative_uncertainty": propagated_uncertainty.get("relative"),
        "propagated_standard_uncertainty": propagated_uncertainty.get("standard"),
        "propagated_expanded_uncertainty": propagated_uncertainty.get("expanded"),
        "propagated_segment_distance_mm": propagated_uncertainty.get("segment_distance_mm"),
        "propagated_segment_time_s": propagated_uncertainty.get("segment_time_s"),
        "student_v": report_float(student.get("student_v")),
        "student_eta": report_float(student.get("student_eta")),
        "v_error": report_float(student.get("v_error")),
        "eta_error": report_float(student.get("eta_error")),
        "score": report_float(student.get("score")),
        "r2": report_float(result.get("r2")),
        "re": report_float(result.get("re")),
        "wall_correction": report_float(result.get("wall_correction")),
        "reynolds_correction": report_float(result.get("reynolds_correction")),
        "tracking_confidence": report_float(result.get("tracking_confidence")),
        "uniform_cv": report_float(quality.get("uniform_segment_cv") or segment.get("cv")),
        "outlier_points": report_float(preprocessing.get("outlier_points")),
        "dropped_points": report_float(preprocessing.get("dropped_points")),
        "segment_duration": report_float(segment_summary.get("duration_s")),
    }


def summary_segment_span(run: dict, terminal_velocity: float | None) -> dict | None:
    velocity_curve = ((run.get("curves") or {}).get("velocity") or [])
    position_curve = ((run.get("curves") or {}).get("position") or [])
    segment = run.get("segment") or {}
    if not velocity_curve and not position_curve:
        return None
    start = int(segment.get("start") or 0)
    end = int(segment.get("end") or (len(velocity_curve) - 1))
    max_velocity_index = max(0, len(velocity_curve) - 1)
    start = max(0, min(start, max_velocity_index))
    end = max(start + 1, min(end, max_velocity_index))
    start_v = velocity_curve[start] if velocity_curve else {}
    end_v = velocity_curve[end] if velocity_curve and end < len(velocity_curve) else (velocity_curve[-1] if velocity_curve else {})
    start_t = report_float(start_v.get("t"))
    end_t = report_float(end_v.get("t"))
    time_s = (end_t - start_t) if start_t is not None and end_t is not None else None
    if time_s is None or time_s <= 0:
        first = position_curve[0] if position_curve else {}
        last = position_curve[-1] if position_curve else {}
        first_t = report_float(first.get("t"))
        last_t = report_float(last.get("t"))
        time_s = (last_t - first_t) if first_t is not None and last_t is not None else None
    if time_s is None or time_s <= 0:
        return None
    pos_start_index = min(start + 1, max(0, len(position_curve) - 1))
    pos_end_index = min(end + 1, max(0, len(position_curve) - 1))
    pos_start = position_curve[pos_start_index] if position_curve else {}
    pos_end = position_curve[pos_end_index] if position_curve else {}
    start_y = report_float(pos_start.get("y"))
    end_y = report_float(pos_end.get("y"))
    distance_m = abs(end_y - start_y) if start_y is not None and end_y is not None else None
    if (distance_m is None or distance_m <= 0) and terminal_velocity is not None:
        distance_m = abs(terminal_velocity) * time_s
    if distance_m is None or distance_m <= 0:
        return None
    return {"time_s": time_s, "distance_m": distance_m}


def summary_propagated_uncertainty(run: dict, eta: float | None) -> dict:
    params = run.get("params") or {}
    result = run.get("result") or {}
    terminal_velocity = report_float(result.get("terminal_velocity"))
    radius_mm = report_float(params.get("radius_mm"))
    tube_diameter_mm = report_float(params.get("tube_diameter_mm"))
    liquid_depth_mm = report_float(params.get("liquid_depth_mm"))
    if eta is None or terminal_velocity is None or radius_mm is None or tube_diameter_mm is None or liquid_depth_mm is None:
        return {}
    span = summary_segment_span(run, terminal_velocity)
    if not span:
        return {}
    d = radius_mm * 2
    D = tube_diameter_mm
    H = liquid_depth_mm
    l = span["distance_m"] * 1000
    t = span["time_s"]
    if min(d, D, H, l, t) <= 0:
        return {}
    delta_d = 0.01
    delta_t = 0.02
    delta_l = 1.0
    delta_tube = 0.01
    delta_h = 5.0
    delta_calibration = 0.5
    wall_d = 1 + (2.4 * d) / D
    depth_h = 1 + (1.6 * d) / H
    diameter_coefficient = (2 / d) - (2.4 / (wall_d * D)) - (1.6 / (depth_h * H))
    diameter_term = abs(diameter_coefficient * delta_d)
    time_term = delta_t / max(t, 1e-12)
    distance_term = delta_l / max(l, 1e-12)
    tube_term = abs(((2.4 * d) / (wall_d * D * D)) * delta_tube)
    depth_term = abs(((1.6 * d) / (depth_h * H * H)) * delta_h)
    calibration_term = delta_calibration / max(l, 1e-12)
    relative = math.hypot(diameter_term, time_term, distance_term, tube_term, depth_term, calibration_term)
    standard = eta * relative
    return {
        "relative": relative,
        "standard": standard,
        "expanded": standard * 2,
        "segment_distance_mm": l,
        "segment_time_s": t,
    }


def summary_values(metrics: list[dict], key: str) -> list[float]:
    values = []
    for item in metrics:
        value = report_float(item.get(key))
        if value is not None and math.isfinite(value):
            values.append(value)
    return values


def summary_stats(metrics: list[dict], key: str) -> dict:
    values = summary_values(metrics, key)
    if not values:
        return {"n": 0, "mean": None, "stdev": None, "rsd": None, "min": None, "max": None}
    mean = sum(values) / len(values)
    if len(values) > 1:
        variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1)
        stdev = math.sqrt(max(0.0, variance))
    else:
        stdev = 0.0
    rsd = stdev / abs(mean) if mean else None
    return {"n": len(values), "mean": mean, "stdev": stdev, "rsd": rsd, "min": min(values), "max": max(values)}


def format_summary_number(value, unit: str = "", digits: int = 3, percent: bool = False) -> str:
    number = report_float(value)
    if number is None or not math.isfinite(number):
        return "未填写"
    if percent:
        return f"{number * 100:.2f}%"
    suffix = f" {unit}" if unit else ""
    return f"{number:.{digits}f}{suffix}"


def summary_stat_row(label: str, metrics: list[dict], key: str, unit: str, digits: int, interpretation: str, percent: bool = False) -> str:
    stat = summary_stats(metrics, key)
    return report_row(
        label,
        stat["n"],
        format_summary_number(stat["mean"], unit, digits, percent),
        format_summary_number(stat["stdev"], unit, digits, percent),
        format_percent(stat["rsd"]) if stat["rsd"] is not None else "未填写",
        format_summary_number(stat["min"], unit, digits, percent),
        format_summary_number(stat["max"], unit, digits, percent),
        interpretation,
    )


def summary_stat_text(metrics: list[dict], key: str, unit: str = "", digits: int = 3, percent: bool = False) -> str:
    stat = summary_stats(metrics, key)
    if not stat["n"]:
        return "未填写"
    mean = format_summary_number(stat["mean"], unit, digits, percent)
    stdev = format_summary_number(stat["stdev"], unit, digits, percent)
    return f"{mean} ± {stdev}（n={stat['n']}）"


def summary_detail_row(item: dict) -> str:
    return report_row(
        item.get("id", "-"),
        str(item.get("created_at") or "-").replace("T", " "),
        item.get("liquid", "-"),
        format_summary_number(item.get("temperature_c"), "℃", 1),
        format_summary_number(item.get("terminal_velocity"), "m/s", 5),
        format_summary_number(item.get("ideal_viscosity"), "Pa·s", 6),
        format_summary_number(item.get("corrected_viscosity"), "Pa·s", 6),
        format_summary_number(item.get("propagated_relative_uncertainty") or item.get("ai_relative_uncertainty"), "", 4, percent=True),
        format_summary_number(item.get("propagated_expanded_uncertainty") or item.get("ai_expanded_uncertainty"), "Pa·s", 6),
        format_summary_number(item.get("re"), "", 4),
        format_summary_number(item.get("r2"), "", 4),
        format_summary_number(item.get("tracking_confidence"), "", 4, percent=True),
        format_summary_number(item.get("uniform_cv"), "", 4),
        format_summary_number(item.get("eta_error"), "", 4, percent=True),
        format_summary_number(item.get("score"), "分", 0),
    )


def summary_group_key(item: dict) -> str:
    liquid = str(item.get("liquid") or "-")
    temp = report_float(item.get("temperature_c"))
    if temp is None:
        return liquid
    return f"{liquid} / {temp:.1f}℃"


def summary_group_rows(metrics: list[dict]) -> list[str]:
    groups: dict[str, list[dict]] = {}
    for item in metrics:
        groups.setdefault(summary_group_key(item), []).append(item)
    if not groups:
        return [report_row("暂无分组", 0, "-", "-", "-", "-", "-", "-")]
    rows = []
    for label in sorted(groups):
        group = groups[label]
        rows.append(report_row(
            label,
            len(group),
            format_summary_number(summary_stats(group, "terminal_velocity")["mean"], "m/s", 5),
            format_summary_number(summary_stats(group, "ideal_viscosity")["mean"], "Pa·s", 6),
            format_summary_number(summary_stats(group, "ideal_viscosity")["stdev"], "Pa·s", 6),
            format_percent(summary_stats(group, "ideal_viscosity")["rsd"]) if summary_stats(group, "ideal_viscosity")["rsd"] is not None else "未填写",
            format_summary_number(summary_stats(group, "re")["mean"], "", 4),
            format_summary_number(summary_stats(group, "score")["mean"], "分", 1),
        ))
    return rows


def summary_conclusion(metrics: list[dict]) -> str:
    count = len(metrics)
    eta_stat = summary_stats(metrics, "ideal_viscosity")
    vt_stat = summary_stats(metrics, "terminal_velocity")
    re_stat = summary_stats(metrics, "re")
    score_stat = summary_stats(metrics, "score")
    uncertainty_stat = summary_stats(metrics, "propagated_expanded_uncertainty")
    fragments = [f"本次共汇总 {count} 条实验记录"]
    if eta_stat["n"]:
        fragments.append(f"AI 理想粘滞系数均值为 {format_summary_number(eta_stat['mean'], 'Pa·s', 6)}，RSD 为 {format_percent(eta_stat['rsd']) if eta_stat['rsd'] is not None else '未填写'}")
    if vt_stat["n"]:
        fragments.append(f"终端速度均值为 {format_summary_number(vt_stat['mean'], 'm/s', 5)}")
    if re_stat["n"]:
        fragments.append(f"Re 均值为 {format_summary_number(re_stat['mean'], '', 4)}")
    if score_stat["n"]:
        fragments.append(f"平均评分为 {format_summary_number(score_stat['mean'], '分', 1)}")
    if uncertainty_stat["n"]:
        fragments.append(f"平均扩展不确定度 U(k=2) 为 {format_summary_number(uncertainty_stat['mean'], 'Pa·s', 6)}")
    quality_flags = summary_quality_flags(metrics)
    if quality_flags:
        fragments.append(f"需要重点复查 {len(quality_flags)} 条记录")
    else:
        fragments.append("未发现明显高风险记录")
    return "；".join(fragments) + "。"


def summary_quality_flags(metrics: list[dict]) -> list[str]:
    flags = []
    for item in metrics:
        reasons = []
        if (item.get("r2") is not None) and item["r2"] < 0.985:
            reasons.append("R²偏低")
        if (item.get("uniform_cv") is not None) and item["uniform_cv"] > 0.08:
            reasons.append("匀速段波动大")
        if (item.get("tracking_confidence") is not None) and item["tracking_confidence"] < 0.72:
            reasons.append("追踪置信度低")
        if (item.get("re") is not None) and item["re"] >= 1:
            reasons.append("Re偏高")
        if (item.get("eta_error") is not None) and item["eta_error"] > 0.2:
            reasons.append("人工η偏差大")
        if reasons:
            flags.append(f"#{item.get('id', '-')}（{'、'.join(reasons)}）")
    return flags[:12]


def summary_advice(metrics: list[dict]) -> list[str]:
    advice = []
    eta_rsd = summary_stats(metrics, "ideal_viscosity").get("rsd")
    confidence = summary_stats(metrics, "tracking_confidence").get("mean")
    re_mean = summary_stats(metrics, "re").get("mean")
    cv_mean = summary_stats(metrics, "uniform_cv").get("mean")
    if eta_rsd is not None and eta_rsd > 0.08:
        advice.append("- 粘滞系数重复性波动较大，建议固定释放高度、摄像机位置和背光条件，并至少重复 5 次后剔除明显异常记录。")
    else:
        advice.append("- 当前多次测量的粘滞系数离散程度可作为重复性分析依据，正式报告中建议同时给出均值、标准差和 RSD。")
    if confidence is not None and confidence < 0.78:
        advice.append("- 平均追踪置信度偏低，优先优化背光、对焦、小球颜色对比和 ROI 范围，再重新采集。")
    if cv_mean is not None and cv_mean > 0.06:
        advice.append("- 匀速段速度离散度偏高，建议延长完整下落观察区间，并复核是否存在底部反光、气泡或小球偏心下落。")
    if re_mean is not None and re_mean >= 1:
        advice.append("- Re 平均值偏高，说明 Stokes 条件风险较大，可换用更小半径小球或更高粘度液体。")
    else:
        advice.append("- 若 Re 和 K壁 均较稳定，可在答辩中强调 AI 不仅输出结果，还能自动检查模型适用条件。")
    if not any(item.get("student_eta") is not None for item in metrics):
        advice.append("- 当前汇总记录缺少人工测量值，建议先让学生补填人工 vt 和 η₀，否则难以体现 AI 与传统方法的对比训练。")
    return advice



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
