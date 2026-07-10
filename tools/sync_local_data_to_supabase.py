#!/usr/bin/env python3
"""Migrate local SQLite experiment records to Supabase.

Run from the project root after filling .env:
    .venv/bin/python tools/sync_local_data_to_supabase.py
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import sqlite3
import sys
from pathlib import Path
from urllib.parse import urlencode


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend import storage  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync local falling-ball experiment history to Supabase.")
    parser.add_argument("--db", default=str(storage.DB_PATH), help="Path to the local SQLite database.")
    parser.add_argument("--limit", type=int, default=None, help="Only migrate the newest N records.")
    parser.add_argument(
        "--keep-local-video-links",
        action="store_true",
        help="Keep local /api/videos links when Supabase Storage is not configured. Not portable across machines.",
    )
    parser.add_argument(
        "--no-videos",
        action="store_true",
        help="Do not upload videos even when Supabase Storage is configured.",
    )
    return parser.parse_args()


def remote_record_exists(created_at: str) -> bool:
    query = urlencode({"select": "id", "created_at": f"eq.{created_at}", "limit": "1"})
    rows = storage.supabase_request("GET", f"{storage.SUPABASE_TABLE}?{query}") or []
    return bool(rows)


def local_rows(db_path: Path, limit: int | None) -> list[sqlite3.Row]:
    if not db_path.exists():
        raise SystemExit(f"Local database not found: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        limit_clause = "LIMIT ?" if limit else ""
        params = (limit,) if limit else ()
        rows = conn.execute(
            f"""
            SELECT id, created_at, liquid, terminal_velocity, viscosity, r2, re, score, payload, source
            FROM runs
            ORDER BY id DESC
            {limit_clause}
            """,
            params,
        ).fetchall()
        return list(reversed(rows))
    finally:
        conn.close()


def maybe_archive_video(payload: dict, *, keep_local_video_links: bool, no_videos: bool) -> tuple[dict, str | None, dict | None]:
    video = payload.get("video") or {}
    filename = Path(str(video.get("filename", ""))).name
    if not filename:
        return payload, None, None
    if no_videos:
        payload.pop("video", None)
        return payload, "skipped video by --no-videos", None
    if storage.use_remote_video_server() and not storage.use_supabase_storage():
        payload.pop("video", None)
        return payload, "will upload video to remote video server after row insert", video
    if not storage.use_supabase_storage():
        if not keep_local_video_links:
            payload.pop("video", None)
            return payload, "removed local-only video link; configure SUPABASE_VIDEO_BUCKET or REMOTE_VIDEO_BASE_URL to migrate videos", None
        return payload, "kept local-only video link", None

    source = storage.VIDEO_DIR / filename
    if not source.exists():
        payload.pop("video", None)
        return payload, f"local video file missing: {source}", None
    mime_type = video.get("mime_type") or mimetypes.guess_type(filename)[0] or "video/webm"
    data = source.read_bytes()
    storage.upload_supabase_video(filename, data, mime_type)
    payload["video"] = storage._video_payload(filename, mime_type, len(data), backend="supabase_storage")
    return payload, f"uploaded video {filename}", None


def upload_remote_video_after_insert(remote_id: int, video: dict | None) -> str | None:
    if not video:
        return None
    filename = Path(str(video.get("filename", ""))).name
    if not filename:
        return None
    source = storage.VIDEO_DIR / filename
    if not source.exists():
        return f"remote video upload skipped; local file missing: {source}"
    mime_type = video.get("mime_type") or mimetypes.guess_type(filename)[0] or "video/webm"
    uploaded = storage.upload_remote_run_video(remote_id, source.read_bytes(), mime_type)
    return f"uploaded video to remote server as {uploaded.get('filename', filename)}" if uploaded else "remote video upload failed"


def migrate() -> None:
    args = parse_args()
    if not storage.use_supabase():
        raise SystemExit("Supabase is not configured. Copy .env.example to .env and fill SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY.")

    rows = local_rows(Path(args.db), args.limit)
    inserted = 0
    skipped = 0
    video_notes: list[str] = []

    for row in rows:
        if remote_record_exists(row["created_at"]):
            skipped += 1
            continue
        payload = json.loads(row["payload"])
        payload, video_note, remote_video = maybe_archive_video(
            payload,
            keep_local_video_links=args.keep_local_video_links,
            no_videos=args.no_videos,
        )
        if video_note:
            video_notes.append(f"run #{row['id']}: {video_note}")
        remote_row = {
            "created_at": row["created_at"],
            "liquid": row["liquid"],
            "terminal_velocity": row["terminal_velocity"],
            "viscosity": row["viscosity"],
            "r2": row["r2"],
            "re": row["re"],
            "score": row["score"],
            "payload": payload,
            "source": row["source"],
        }
        inserted_rows = storage.supabase_request(
            "POST",
            storage.SUPABASE_TABLE,
            [remote_row],
            headers={"Prefer": "return=representation"},
        ) or []
        if remote_video and inserted_rows:
            remote_note = upload_remote_video_after_insert(int(inserted_rows[0]["id"]), remote_video)
            if remote_note:
                video_notes.append(f"run #{row['id']}: {remote_note}")
        inserted += 1

    print(f"Supabase sync complete: inserted={inserted}, skipped_existing={skipped}, total_local={len(rows)}")
    if video_notes:
        print("Video notes:")
        for note in video_notes:
            print(f"- {note}")


if __name__ == "__main__":
    migrate()
