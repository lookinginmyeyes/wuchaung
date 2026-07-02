import json
import mimetypes
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

try:
    from .modules import module_summary, readiness_summary
    from .physics import analyze_trajectory, answer_question, build_diagnostics, build_params, build_simulation, inspect_video_metadata, to_optional_float
    from .storage import VIDEO_DIR, attach_run_video, build_report_text, delete_run, delete_runs, get_run, init_db, latest_run, list_runs, save_run, storage_status, update_run_payload
    from .vision import build_video_track_config, detect_ball_from_image_bytes, extract_trajectory_from_video_bytes, inspect_vision_runtime
except ImportError:
    from modules import module_summary, readiness_summary
    from physics import analyze_trajectory, answer_question, build_diagnostics, build_params, build_simulation, inspect_video_metadata, to_optional_float
    from storage import VIDEO_DIR, attach_run_video, build_report_text, delete_run, delete_runs, get_run, init_db, latest_run, list_runs, save_run, storage_status, update_run_payload
    from vision import build_video_track_config, detect_ball_from_image_bytes, extract_trajectory_from_video_bytes, inspect_vision_runtime


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"


class PlatformHandler(BaseHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/videos/"):
            self.handle_video_asset(parsed.path, head_only=True)
            return
        self.send_error(404, "Not found")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json({"ok": True, "name": "falling-ball-ai-platform", "storage": storage_status()})
            return
        if parsed.path == "/api/modules":
            self.send_json(module_summary())
            return
        if parsed.path == "/api/readiness":
            self.send_json(readiness_summary())
            return
        if parsed.path == "/api/vision/runtime":
            self.send_json(inspect_vision_runtime())
            return
        if parsed.path == "/api/runs":
            query = parse_qs(parsed.query)
            limit = int(query["limit"][0]) if query.get("limit") else None
            self.send_json({"runs": list_runs(limit=limit)})
            return
        if parsed.path.startswith("/api/runs/") and parsed.path.endswith("/report"):
            run_id = int(parsed.path.split("/")[-2])
            run = get_run(run_id)
            if not run:
                self.send_error(404, "Run not found")
                return
            student = run.get("student") or {}
            if not student.get("student_v") or not student.get("student_eta"):
                self.send_json({"error": "请先提交人工终端速度和人工粘滞系数，再生成实验报告。"}, status=400)
                return
            self.send_text(build_report_text(run), filename=f"run-{run_id}-report.md")
            return
        if parsed.path.startswith("/api/runs/"):
            run_id = int(parsed.path.rsplit("/", 1)[-1])
            run = get_run(run_id)
            if not run:
                self.send_error(404, "Run not found")
                return
            self.send_json(run)
            return
        if parsed.path.startswith("/api/videos/"):
            self.handle_video_asset(parsed.path)
            return
        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/runs/delete":
            payload = self.read_json()
            deleted = delete_runs(payload.get("ids", []))
            self.send_json({"deleted": deleted})
            return
        if parsed.path == "/api/measurements/trajectory":
            payload = self.read_json()
            params = build_params(payload.get("params", {}))
            student = payload.get("student", {})
            try:
                run = analyze_trajectory(params, payload.get("trajectory", []), student=student)
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return
            run["source"] = payload.get("source", "csv")
            run_id = save_run(run)
            run["id"] = run_id
            self.send_json(run)
            return
        if parsed.path == "/api/measurements/preview":
            payload = self.read_json()
            params = build_params(payload.get("params", {}))
            try:
                run = analyze_trajectory(params, payload.get("trajectory", []), student=payload.get("student", {}))
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return
            self.send_json(run)
            return
        if parsed.path == "/api/assistant/ask":
            payload = self.read_json()
            question = str(payload.get("question", ""))
            self.send_json(answer_question(question, latest_run(), payload.get("context")))
            return
        if parsed.path == "/api/video/inspect":
            payload = self.read_json()
            self.send_json(inspect_video_metadata(payload))
            return
        if parsed.path == "/api/simulation/run":
            payload = self.read_json()
            try:
                result = build_simulation(payload)
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return
            self.send_json(result)
            return
        if parsed.path == "/api/video/track":
            self.handle_video_track()
            return
        if parsed.path == "/api/video/frame":
            self.handle_video_frame()
            return
        if parsed.path.startswith("/api/runs/") and parsed.path.endswith("/video"):
            self.handle_run_video_upload(parsed.path)
            return
        if parsed.path.startswith("/api/runs/") and parsed.path.endswith("/student"):
            self.handle_run_student_update(parsed.path)
            return
        self.send_error(404, "Not found")

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/runs/"):
            try:
                run_id = int(parsed.path.rsplit("/", 1)[-1])
            except ValueError:
                self.send_json({"error": "记录ID无效"}, status=400)
                return
            if not delete_run(run_id):
                self.send_error(404, "Run not found")
                return
            self.send_json({"deleted": 1, "id": run_id})
            return
        self.send_error(404, "Not found")

    def read_json(self) -> dict:
        size = int(self.headers.get("Content-Length", "0"))
        if size <= 0:
            return {}
        raw = self.rfile.read(size).decode("utf-8")
        return json.loads(raw)

    def handle_video_track(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("video/"):
            self.send_json({"error": "请直接上传 video/mp4、video/quicktime 或 video/webm 文件；参数先用查询字符串传入。"}, status=400)
            return
        size = int(self.headers.get("Content-Length", "0"))
        if size <= 0:
            self.send_json({"error": "视频文件为空"}, status=400)
            return
        if size > 120 * 1024 * 1024:
            self.send_json({"error": "视频文件过大，当前预览接口限制 120MB"}, status=413)
            return
        query = parse_qs(urlparse(self.path).query)
        config = build_video_track_config({key: values[0] for key, values in query.items()})
        suffix = mimetypes.guess_extension(content_type.split(";")[0]) or ".mp4"
        try:
            result = extract_trajectory_from_video_bytes(self.rfile.read(size), suffix=suffix, config=config)
        except (RuntimeError, ValueError) as error:
            self.send_json({"error": str(error), "runtime": inspect_vision_runtime()}, status=400)
            return
        self.send_json(result)

    def handle_video_frame(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("image/"):
            self.send_json({"error": "请提交 image/jpeg 或 image/png 单帧图像。"}, status=400)
            return
        size = int(self.headers.get("Content-Length", "0"))
        if size <= 0:
            self.send_json({"error": "图像帧为空"}, status=400)
            return
        if size > 4 * 1024 * 1024:
            self.send_json({"error": "图像帧过大，实时追踪单帧限制 4MB"}, status=413)
            return
        query = parse_qs(urlparse(self.path).query)
        config = build_video_track_config({key: values[0] for key, values in query.items()})
        try:
            frame_index = int(query.get("frame", ["0"])[0])
        except ValueError:
            frame_index = 0
        try:
            timestamp = float(query.get("t", ["0"])[0])
        except ValueError:
            timestamp = None
        try:
            result = detect_ball_from_image_bytes(self.rfile.read(size), config=config, frame_index=frame_index, timestamp=timestamp)
        except (RuntimeError, ValueError) as error:
            self.send_json({"error": str(error), "runtime": inspect_vision_runtime()}, status=400)
            return
        self.send_json(result)

    def handle_run_student_update(self, path: str) -> None:
        try:
            run_id = int(path.split("/")[-2])
        except (IndexError, ValueError):
            self.send_json({"error": "记录ID无效"}, status=400)
            return
        run = get_run(run_id)
        if not run:
            self.send_json({"error": "记录不存在"}, status=404)
            return

        payload = self.read_json()
        student_v = to_optional_float(payload.get("student_v"))
        student_eta = to_optional_float(payload.get("student_eta"))
        if student_v is None or student_eta is None or student_v <= 0 or student_eta <= 0:
            self.send_json({"error": "请提交有效的人工终端速度和人工粘滞系数。"}, status=400)
            return

        result = run.get("result") or {}
        params = build_params(run.get("params") or {})
        terminal_velocity = float(result.get("terminal_velocity") or 0)
        viscosity = float(result.get("viscosity") or 0)
        r2 = float(result.get("r2") or 0)
        re = float(result.get("re") or 0)
        if terminal_velocity <= 0 or viscosity <= 0:
            self.send_json({"error": "当前记录缺少AI参考结果，无法评分。"}, status=400)
            return

        v_error = abs(student_v - terminal_velocity) / terminal_velocity
        eta_error = abs(student_eta - viscosity) / viscosity
        score = max(48.0, min(98.0, 100 - eta_error * 260 - v_error * 160 - (1 - r2) * 85))
        tube_ratio = (2 * params.radius_mm) / params.tube_diameter_mm
        run["student"] = {
            "student_v": student_v,
            "student_eta": student_eta,
            "v_error": v_error,
            "eta_error": eta_error,
            "score": score,
        }
        run["diagnostics"] = build_diagnostics(params, r2, re, tube_ratio, score, v_error, eta_error, run.get("quality") or {})
        updated = update_run_payload(run_id, run)
        if not updated:
            self.send_json({"error": "记录保存失败"}, status=500)
            return
        self.send_json({"run": updated})

    def handle_run_video_upload(self, path: str) -> None:
        try:
            run_id = int(path.split("/")[-2])
        except (IndexError, ValueError):
            self.send_json({"error": "记录ID无效"}, status=400)
            return
        if not get_run(run_id):
            self.send_json({"error": "记录不存在，无法保存录像"}, status=404)
            return
        content_type = self.headers.get("Content-Type", "video/webm").split(";")[0] or "video/webm"
        if not content_type.startswith("video/"):
            self.send_json({"error": "请上传视频文件"}, status=400)
            return
        size = int(self.headers.get("Content-Length", "0"))
        if size <= 0:
            self.send_json({"error": "视频文件为空"}, status=400)
            return
        if size > 180 * 1024 * 1024:
            self.send_json({"error": "录像文件过大，当前限制 180MB"}, status=413)
            return
        suffix = mimetypes.guess_extension(content_type) or ".webm"
        if suffix == ".jpe":
            suffix = ".jpg"
        filename = f"run-{run_id}-{int(time.time())}{suffix}"
        VIDEO_DIR.mkdir(parents=True, exist_ok=True)
        target = VIDEO_DIR / filename
        target.write_bytes(self.rfile.read(size))
        video = attach_run_video(run_id, filename, content_type, size)
        self.send_json({"video": video})

    def handle_video_asset(self, path: str, head_only: bool = False) -> None:
        filename = Path(unquote(path.rsplit("/", 1)[-1])).name
        target = (VIDEO_DIR / filename).resolve()
        try:
            target.relative_to(VIDEO_DIR.resolve())
        except ValueError:
            self.send_error(404, "Video not found")
            return
        if not target.exists() or not target.is_file():
            self.send_error(404, "Video not found")
            return

        content_type = mimetypes.guess_type(target.name)[0] or "video/webm"
        file_size = target.stat().st_size
        range_header = self.headers.get("Range")
        if range_header and range_header.startswith("bytes="):
            start_text, _, end_text = range_header.replace("bytes=", "", 1).partition("-")
            try:
                start = int(start_text) if start_text else 0
                end = int(end_text) if end_text else file_size - 1
            except ValueError:
                self.send_error(416, "Invalid range")
                return
            start = max(0, min(start, file_size - 1))
            end = max(start, min(end, file_size - 1))
            length = end - start + 1
            self.send_response(206)
            self.send_header("Content-Type", content_type)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            self.send_header("Content-Length", str(length))
            self.end_headers()
            if head_only:
                return
            with target.open("rb") as file:
                file.seek(start)
                self.wfile.write(file.read(length))
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(file_size))
        self.end_headers()
        if head_only:
            return
        body = target.read_bytes()
        self.wfile.write(body)

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            return

    def send_text(self, text: str, filename: str) -> None:
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Disposition", f"attachment; filename={filename}")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, request_path: str) -> None:
        if request_path in ("", "/"):
            target = FRONTEND / "index.html"
        else:
            clean = request_path.lstrip("/")
            target = FRONTEND / clean
        if not target.exists() or not target.is_file():
            self.send_error(404, "File not found")
            return
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[server] {self.address_string()} {fmt % args}")


def main() -> None:
    init_db()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8877
    server = ThreadingHTTPServer(("127.0.0.1", port), PlatformHandler)
    print(f"Falling Ball AI Platform running at http://127.0.0.1:{port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
