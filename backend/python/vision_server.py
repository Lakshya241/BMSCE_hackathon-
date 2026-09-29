"""
Chain Sentry — Python OpenCV Vision Service
============================================
Owns the PC webcam and does the heavy vision work for the Detection Lab:

  GET /health    → camera + cascade status
  GET /stream    → MJPEG live stream with detection boxes drawn
  GET /snapshot  → single JPEG frame (used for the 10s privacy-gated captures)
  GET /analyze   → JSON: motion, persons[], faces[] (with family recognition)

Face recognition matches against backend/data/family.json using the same
perceptual signature as the Node backend (5x5 luma grid + 24-bin hue histogram,
cosine + intersection, threshold 0.82) — so enrollments made in the browser UI
are recognized here too.

Run:  python vision_server.py   (port 5001)
"""

import json
import math
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import cv2
import numpy as np

PORT = int(os.environ.get("VISION_PORT", "5001"))
CAMERA_INDEX = int(os.environ.get("VISION_CAMERA", "0"))
FAMILY_JSON = os.path.join(os.path.dirname(__file__), "..", "data", "family.json")

MATCH_THRESHOLD = 0.82
FRAME_W = 640
FRAME_H = 480

# ---------------------------------------------------------------- camera
cap = None
cap_lock = threading.Lock()
cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)
prev_gray = None
last_frame = None  # latest BGR frame (shared, guarded by cap_lock)
last_error = None


def open_camera():
    global cap
    cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_H)
    # warm-up: discard the first frames; some drivers deliver black after reopen
    for _ in range(30):
        ok, frame = cap.read()
        if ok and frame is not None and float(frame.mean()) > 2.0:
            return True
        time.sleep(0.1)
    return cap.isOpened()


black_streak = 0  # consecutive fully-black frames (camera stuck state)


def read_frame():
    """Read one frame; auto-recovers from black/stuck camera states."""
    global cap, black_streak
    with cap_lock:
        if cap is None or not cap.isOpened():
            if not open_camera():
                return False, None
        ok, frame = cap.read()
        if ok and frame is not None:
            if float(frame.mean()) < 1.5:
                black_streak += 1
                if black_streak > 10:
                    # stuck black stream — hard reopen
                    try:
                        cap.release()
                    except Exception:
                        pass
                    cap = None
                    black_streak = 0
                    time.sleep(0.5)
                    if open_camera():
                        ok, frame = cap.read()
                else:
                    time.sleep(0.05)
            else:
                black_streak = 0
        if not ok:
            # camera yanked / driver hiccup — reopen once
            try:
                cap.release()
            except Exception:
                pass
            cap = None
            if open_camera():
                ok, frame = cap.read()
        return ok, frame


# ------------------------------------------------------------ signatures
def signature_from_bgr(frame, x, y, w, h):
    """Compute the perceptual signature for a face region (same math as Node)."""
    crop = frame[y : y + h, x : x + w]
    if crop.size == 0:
        return None
    crop = cv2.resize(crop, (32, 32), interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB).astype(np.float64)

    GRID, HB = 5, 24
    grid = np.zeros(GRID * GRID)
    grid_n = np.zeros(GRID * GRID)
    hue = np.zeros(HB)
    hue_total = 0.0

    r = rgb[:, :, 0]
    g = rgb[:, :, 1]
    b = rgb[:, :, 2]
    luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0

    for yy in range(32):
        for xx in range(32):
            gy = min(GRID - 1, int(yy / 32 * GRID))
            gx = min(GRID - 1, int(xx / 32 * GRID))
            grid[gy * GRID + gx] += luma[yy, xx]
            grid_n[gy * GRID + gx] += 1

    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat_mask = (mx > 30) & ((mx - mn) > 18)
    ys, xs = np.nonzero(sat_mask)
    for yy, xx in zip(ys, xs):
        rr, gg, bb = r[yy, xx], g[yy, xx], b[yy, xx]
        mxv, mnv = mx[yy, xx], mn[yy, xx]
        if mxv == rr:
            h0 = ((gg - bb) / (mxv - mnv)) % 6
        elif mxv == gg:
            h0 = (bb - rr) / (mxv - mnv) + 2
        else:
            h0 = (rr - gg) / (mxv - mnv) + 4
        hue[int(round(((h0 * 60 + 360) % 360) / 15)) % HB] += 1
        hue_total += 1

    grid_norm = [round(float(v / max(1, n)), 4) for v, n in zip(grid, grid_n)]
    hue_norm = [round(float(v / max(1, hue_total)), 4) for v in hue]
    return {"grid": grid_norm, "hue": hue_norm}


def cosine(a, b):
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na < 1e-9 or nb < 1e-9:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def hist_intersection(a, b):
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    return float(min(1.0, np.minimum(a[: len(b)], b[: len(a)]).sum()))


def load_family():
    try:
        with open(FAMILY_JSON, "r", encoding="utf-8") as f:
            members = json.load(f)
        out = []
        for m in members:
            sig = m.get("signature") or {}
            if isinstance(sig.get("grid"), list) and isinstance(sig.get("hue"), list):
                out.append(m)
        return out
    except Exception:
        return []


def match_face(sig):
    best = None
    for m in load_family():
        s = m["signature"]
        sim = 0.72 * cosine(sig["grid"], s["grid"]) + 0.28 * hist_intersection(sig["hue"], s["hue"])
        if best is None or sim > best["similarity"]:
            best = {"id": m.get("id", ""), "name": m.get("name", "?"), "relation": m.get("relation", ""), "similarity": round(sim, 4)}
    return best


# ------------------------------------------------------------- detection
analysis = {
    "motion": False,
    "motionScore": 0,
    "persons": [],
    "faces": [],
    "brightness": 0,
    "ts": 0,
    "error": None,
}
analysis_lock = threading.Lock()


def detection_loop():
    """Background thread: grab frames, detect, recognize, update shared state."""
    global prev_gray, last_frame, last_error
    while True:
        ok, frame = read_frame()
        if not ok:
            last_error = "camera not available (index %d)" % CAMERA_INDEX
            time.sleep(0.5)
            continue
        last_error = None
        last_frame = frame

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        small = cv2.resize(gray, (160, 90))
        brightness = float(small.mean())

        # motion: frame differencing (mirror of the browser engine's gate)
        motion = False
        motion_score = 0
        if prev_gray is not None and prev_gray.shape == small.shape:
            diff = cv2.absdiff(small, prev_gray)
            changed = float((diff > 48).sum()) / diff.size
            motion_score = int(min(100, changed * 900))
            motion = changed > 0.005
        prev_gray = small

        # faces (Haar)
        faces_out = []
        persons_out = []
        faces = cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(48, 48))
        for (x, y, w, h) in faces[:4]:
            sig = signature_from_bgr(frame, x, y, w, h)
            fam, name, rel, sim = False, None, None, 0.0
            if sig:
                best = match_face(sig)
                if best:
                    fam = best["similarity"] >= MATCH_THRESHOLD
                    sim = best["similarity"]
                    if fam:
                        name, rel = best["name"], best["relation"]
            faces_out.append({
                "box": {"x": round(x / FRAME_W, 4), "y": round(y / FRAME_H, 4),
                        "w": round(w / FRAME_W, 4), "h": round(h / FRAME_H, 4)},
                "family": fam, "name": name, "relation": rel, "similarity": sim,
            })
            # approximate person box: head + torso below the face
            px = max(0, x - int(w * 0.4))
            pw = min(FRAME_W - px, int(w * 1.8))
            py = max(0, y - int(h * 0.25))
            ph = min(FRAME_H - py, int(h * 2.6))
            persons_out.append({
                "x": round(px / FRAME_W, 4), "y": round(py / FRAME_H, 4),
                "w": round(pw / FRAME_W, 4), "h": round(ph / FRAME_H, 4),
                "conf": 0.9 if fam else 0.75,
            })

        with analysis_lock:
            analysis.update({
                "motion": motion,
                "motionScore": motion_score,
                "persons": persons_out,
                "faces": faces_out,
                "brightness": int(brightness),
                "ts": time.time(),
                "error": None,
            })
        time.sleep(0.08)  # ~12 fps analysis


def draw_boxes(frame):
    with analysis_lock:
        faces = list(analysis["faces"])
        persons = list(analysis["persons"])
    for p in persons:
        x, y = int(p["x"] * FRAME_W), int(p["y"] * FRAME_H)
        w, h = int(p["w"] * FRAME_W), int(p["h"] * FRAME_H)
        cv2.rectangle(frame, (x, y), (x + w, y + h), (163, 101, 13) if False else (13, 101, 163), 2)
    for f in faces:
        b = f["box"]
        x, y = int(b["x"] * FRAME_W), int(b["y"] * FRAME_H)
        w, h = int(b["w"] * FRAME_W), int(b["h"] * FRAME_H)
        if f["family"]:
            color = (13, 163, 101)  # green-ish (BGR)
            label = f"FAMILY {f['name']} {int(f['similarity']*100)}%"
        else:
            color = (72, 29, 225)  # red-ish (BGR)
            label = "STRANGER" + (f" {int(f['similarity']*100)}%" if f["similarity"] else "")
        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
        ty = max(14, y - 6)
        cv2.putText(frame, label, (x, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)
    cv2.putText(frame, "CHAIN SENTRY · OPENCV", (10, FRAME_H - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1, cv2.LINE_AA)
    return frame


def encode_jpeg(draw=True):
    ok, frame = read_frame()
    if not ok or frame is None:
        return None
    if draw:
        frame = draw_boxes(frame.copy())
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 72])
    return buf.tobytes() if ok else None


# ---------------------------------------------------------------- server
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            with cap_lock:
                opened = cap is not None and cap.isOpened()
            self._json({
                "ok": True, "service": "chain-sentry-vision",
                "camera": {"open": opened, "index": CAMERA_INDEX},
                "cascade": not cascade.empty(),
                "familyMembers": len(load_family()),
                "error": last_error,
            })
        elif path == "/analyze":
            with analysis_lock:
                snap = dict(analysis)
                snap["faces"] = list(analysis["faces"])
                snap["persons"] = list(analysis["persons"])
            snap["vaultSize"] = len(load_family())
            self._json(snap)
        elif path == "/snapshot":
            jpg = encode_jpeg(draw=False)
            if jpg is None:
                self._json({"error": "no frame"}, 503)
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(jpg)))
            self._cors()
            self.end_headers()
            self.wfile.write(jpg)
        elif path == "/stream":
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self._cors()
            self.end_headers()
            try:
                while True:
                    jpg = encode_jpeg(draw=True)
                    if jpg is None:
                        time.sleep(0.2)
                        continue
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(jpg)).encode() + b"\r\n\r\n" + jpg + b"\r\n")
                    time.sleep(0.05)  # ~20 fps stream
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                pass
        else:
            self._json({"error": "not found", "endpoints": ["/health", "/analyze", "/snapshot", "/stream"]}, 404)


if __name__ == "__main__":
    t = threading.Thread(target=detection_loop, daemon=True)
    t.start()
    print(f"  [vision] Chain Sentry vision service on http://localhost:{PORT}")
    print(f"      stream:  http://localhost:{PORT}/stream")
    print(f"      analyze: http://localhost:{PORT}/analyze")
    try:
        ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
