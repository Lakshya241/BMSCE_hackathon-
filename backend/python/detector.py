#!/usr/bin/env python3
"""
Chain Sentry — Python OpenCV Detector Service
=============================================
Real computer-vision incident detection that feeds the Chain Sentry pipeline.

- Motion detection via MOG2 background subtraction
- Person detection via HOG + SVM (no heavy model download needed)
- Risk scoring mirrors the in-browser engine
- POSTs incidents to the Next.js API (/api/incidents), where the evidence
  is hashed (SHA-256), anchored on MST, and verified by the agent quorum.

Usage:
    pip install opencv-python requests
    python detector.py --source 0              # webcam
    python detector.py --source video.mp4      # video file
    python detector.py --source rtsp://...     # RTSP CCTV stream
Options:
    --api http://localhost:3000   base URL of the Chain Sentry console
    --camera CAM-001              camera id registered in the console
    --threshold 55                risk score required to raise an incident
    --cooldown 15                 seconds between incidents per camera
"""

import argparse
import json
import time

import cv2
import numpy as np
import requests

PERSON_W, PERSON_H = (64, 128)


def build_person_detector():
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    return hog


def main():
    ap = argparse.ArgumentParser(description="Chain Sentry OpenCV detector")
    ap.add_argument("--source", default="0", help="webcam index, video path, or rtsp url")
    ap.add_argument("--api", default="http://localhost:3000")
    ap.add_argument("--camera", default="CAM-001")
    ap.add_argument("--threshold", type=int, default=55)
    ap.add_argument("--cooldown", type=int, default=15)
    ap.add_argument("--show", action="store_true", help="display debug window")
    args = ap.parse_args()

    src = int(args.source) if args.source.isdigit() else args.source
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        print(f"[!] cannot open source: {args.source}")
        return

    hog = build_person_detector()
    bg = cv2.createBackgroundSubtractorMOG2(history=240, varThreshold=36, detectShadows=False)
    last_fire = 0.0
    frame_idx = 0

    print(f"[chain-sentry] streaming {args.source} -> {args.api} as {args.camera}")

    while True:
        ok, frame = cap.read()
        if not ok:
            time.sleep(0.5)
            continue
        frame_idx += 1
        if frame_idx % 2:  # analyze every other frame
            continue

        frame = cv2.resize(frame, (640, 360))
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # ---- motion (background subtraction) ----
        mask = bg.apply(gray)
        motion_ratio = float(np.count_nonzero(mask)) / mask.size
        motion = motion_ratio > 0.02

        # ---- persons (HOG) every 5th analyzed frame ----
        persons = []
        if frame_idx % 10 == 0:
            rects, weights = hog.detectMultiScale(frame, winStride=(8, 8), padding=(8, 8), scale=1.05)
            persons = [
                {"x": int(x) / 640, "y": int(y) / 360, "w": int(w) / 640, "h": int(h) / 360, "conf": float(min(0.97, wgt))}
                for (x, y, w, h), wgt in zip(rects, weights)
                if wgt > 0.45
            ]

        # ---- risk score (mirrors src/lib/detect.ts) ----
        score = 0
        reasons = []
        if motion:
            score += 18
            reasons.append("motion")
        if persons:
            score += 24
            reasons.append(f"{len(persons)} person(s)")
        if motion_ratio > 0.18:
            score += 12
            reasons.append("rapid motion burst")

        # ---- fire incident ----
        now = time.time()
        if score >= args.threshold and now - last_fire > args.cooldown:
            last_fire = now
            severity = "critical" if score >= 80 else "high" if score >= 60 else "medium" if score >= 38 else "low"
            payload = {
                "cameraId": args.camera,
                "type": "person_detected" if persons else "motion",
                "title": "Person detected (OpenCV)" if persons else "Motion detected (OpenCV)",
                "severity": severity,
                "riskScore": min(100, score),
                "description": f"OpenCV detector: {', '.join(reasons)}",
                "source": "sensor",
                "zone": None,
                "frames": 10,
            }
            try:
                r = requests.post(f"{args.api}/api/incidents", json=payload, timeout=5)
                print(f"[→] incident posted ({r.status_code}): {payload['title']} risk={payload['riskScore']}")
            except requests.RequestException as e:
                print(f"[!] api unreachable: {e}")

        if args.show:
            cv2.imshow("chain-sentry detector", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
