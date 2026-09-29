"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Video, Upload, MonitorPlay, Square, Eye, Crosshair, ShieldAlert, Camera, UserPlus, Users, Lock, Unlock, Radio, Cpu, Home, ShieldBan, Globe } from "lucide-react";
import { analyzeFrame, scoreEvent, type DetectResult } from "@/lib/detect";
import { extractFaceRGB, matchFaceOnBackend, cropToDataURL, canvasToDataURL } from "@/lib/faceMatch";
import type { Settings, FamilyMember, AreaMode } from "@/lib/types";
import { Btn } from "./ui";

type FeedMode = "webcam" | "upload" | "simulated" | "opencv";

interface LabProps {
  settings: Settings;
  onIncident: (payload: Record<string, unknown>) => Promise<void>;
}

const EMPTY_RESULT: DetectResult = {
  motion: false, motionScore: 0, persons: [], tamper: { detected: false, type: null, score: 0 },
  brightness: 0, zones: [], tripwire: [], crossedTripwire: false, zoneOccupied: false, freezeDetected: false, timestamp: 0,
};

interface LiveFace {
  box: { x: number; y: number; w: number; h: number };
  family: boolean;
  name: string | null;
  similarity: number;
  rgb: number[];
  width: number;
  height: number;
}

/** Shape of the Python vision service /analyze response. */
interface PyFace {
  box: { x: number; y: number; w: number; h: number };
  family: boolean;
  name: string | null;
  relation: string | null;
  similarity: number;
}
interface PyAnalyze {
  motion: boolean;
  motionScore: number;
  persons: { x: number; y: number; w: number; h: number; conf: number }[];
  faces: PyFace[];
  brightness: number;
  vaultSize?: number;
}

const VISION_BASE = "/backend/vision"; // proxied to http://localhost:5001 by next.config

/** Per-mode intrusion policy — the heart of the 3-mode system. */
function areaIntrusion(mode: AreaMode, res: DetectResult, faces: { family: boolean }[]): { intrusion: boolean; label: string; severity: "low" | "medium" | "high" | "critical" } {
  const strangers = faces.filter((f) => !f.family).length;
  const family = faces.length - strangers;
  switch (mode) {
    case "family":
      // Alert ONLY when a stranger is present WITHOUT any family member.
      if (strangers > 0 && family === 0)
        return { intrusion: true, label: `stranger in family area (${strangers}, no family present)`, severity: strangers > 1 ? "critical" : "high" };
      return { intrusion: false, label: strangers > 0 ? "stranger accompanied by family — no alert" : "family area secure", severity: "low" };
    case "restricted":
      // ANY presence alerts — even family.
      if (faces.length > 0)
        return { intrusion: true, label: `presence in restricted area (${faces.length} face${faces.length > 1 ? "s" : ""}${family ? `, ${family} family` : ""})`, severity: "critical" };
      if (res.motion || res.persons.length)
        return { intrusion: true, label: "motion in restricted area", severity: "high" };
      return { intrusion: false, label: "restricted area clear", severity: "low" };
    case "public":
      // NEVER alerts — hash chain only.
      return { intrusion: false, label: "public area — hash chain only", severity: "low" };
  }
}

export default function DetectionLab({ settings, onIncident }: LabProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null); // MJPEG stream element (opencv mode)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const prevRef = useRef<Uint8ClampedArray | null>(null);
  const prevBrightRef = useRef(0);
  const lastMotionAtRef = useRef(0);
  const tripwireFiredRef = useRef(0);
  const zoneFiredRef = useRef(0);
  const personFiredRef = useRef(0);
  const motionFiredRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  // The fix for "webcam shows the simulated scene": the loop reads the mode
  // from this ref every frame instead of a stale closure value.
  const modeRef = useRef<FeedMode>("simulated");
  const runningRef = useRef(false);
  const lastCaptureAtRef = useRef(0);
  const lastFaceCheckAtRef = useRef(0);
  const pyAnalyzeRef = useRef<PyAnalyze | null>(null);
  const pyPollRef = useRef<ReturnType<typeof setInterval> | 0>(0);
  const areaIntrudedRef = useRef(false);
  const areaAlertRef = useRef(0);

  const [mode, setMode] = useState<FeedMode>("simulated");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DetectResult>(EMPTY_RESULT);
  const [eventLog, setEventLog] = useState<{ time: string; text: string; sev: string }[]>([]);
  const [drawMode, setDrawMode] = useState<"none" | "zone" | "tripwire">("none");
  const [zone, setZone] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [tripwire, setTripwire] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [armed, setArmed] = useState(settings.armed ?? true);
  const [sens, setSens] = useState(settings.motionSensitivity ?? 65);
  const riskThreshold = settings.riskThreshold ?? 55;
  const [liveFaces, setLiveFaces] = useState<LiveFace[]>([]);
  const [enrollFace, setEnrollFace] = useState<LiveFace | null>(null);
  const [enrollName, setEnrollName] = useState("");
  const [enrollRelation, setEnrollRelation] = useState("family");
  const [vault, setVault] = useState<FamilyMember[]>([]);
  const [captureState, setCaptureState] = useState<string>("idle");
  const [incidentsFired, setIncidentsFired] = useState(0);
  const [visionOnline, setVisionOnline] = useState(false);
  const [areaMode, setAreaMode] = useState<AreaMode>("family");
  const areaModeRef = useRef<AreaMode>("family");

  const log = (text: string, sev = "info") =>
    setEventLog((l) => [{ time: new Date().toLocaleTimeString(), text, sev }, ...l].slice(0, 14));

  // ---------- vault ----------
  const refreshVault = useCallback(async () => {
    try {
      const r = await fetch("/backend/api/family").then((x) => x.json());
      setVault(r.members ?? []);
    } catch { /* backend down */ }
  }, []);
  useEffect(() => { refreshVault(); }, [refreshVault]);

  // ---------- python vision health ----------
  useEffect(() => {
    const check = () =>
      fetch(`${VISION_BASE}/health`)
        .then((r) => r.json())
        .then((h) => setVisionOnline(Boolean(h?.ok)))
        .catch(() => setVisionOnline(false));
    check();
    const t = setInterval(check, 8000);
    return () => clearInterval(t);
  }, []);

  const enrollFromFace = async () => {
    if (!enrollFace || !enrollName.trim()) return;
    try {
      const photo = cropToDataURL(canvasRef.current!, enrollFace.box, 96);
      await fetch("/backend/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: enrollName.trim(), relation: enrollRelation, photo,
          rgb: enrollFace.rgb, width: enrollFace.width, height: enrollFace.height,
        }),
      });
      log(`✅ ${enrollName.trim()} enrolled — Python vision recognizes them too`, "success");
      setEnrollName("");
      setEnrollFace(null);
      refreshVault();
    } catch {
      log("enrollment failed — is the backend running?", "critical");
    }
  };

  // ---------- simulated CCTV scene ----------
  const simulateScene = useCallback((ctx: CanvasRenderingContext2D, t: number) => {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#e7eef7");
    g.addColorStop(1, "#dbe5f0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(71,105,150,0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo((W / 10) * i, H * 0.45);
      ctx.lineTo((W / 10) * i - 60, H);
      ctx.stroke();
    }
    for (let y = 0.45; y < 1; y += 0.06) {
      const yy = y * H;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(W, yy);
      ctx.stroke();
    }
    ctx.fillStyle = "#c9d7ea";
    ctx.fillRect(W * 0.62, H * 0.28, W * 0.16, H * 0.5);
    ctx.strokeStyle = "rgba(8,145,178,0.7)";
    ctx.strokeRect(W * 0.62, H * 0.28, W * 0.16, H * 0.5);
    ctx.fillStyle = "#0e7490";
    ctx.font = "10px monospace";
    ctx.fillText("VAULT", W * 0.62 + 6, H * 0.28 + 14);

    // walker — mid-shot CCTV proportions so the CV heuristics see it
    const cycle = (t * 0.00045) % 1;
    const throughDoor = Math.floor(t / 9000) % 2 === 0;
    const px = throughDoor ? W * (0.1 + cycle * 0.72) : W * (0.06 + cycle * 0.5);
    const py = throughDoor ? H * 0.66 : H * 0.8;
    const bob = Math.sin(t / 90) * 3;
    const s = 2.6;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(px - 7 * s, py - 34 * s + bob, 14 * s, 24 * s);
    ctx.fillRect(px - 5 * s, py - 46 * s + bob, 10 * s, 12 * s);
    ctx.fillRect(px - 9 * s, py - 12 * s + bob, 5 * s, 12 * s);
    ctx.fillRect(px + 4 * s, py - 12 * s + bob, 5 * s, 12 * s);
    if (Math.floor(t / 7000) % 3 === 0) {
      const qx = W * (0.9 - cycle * 0.5);
      ctx.fillRect(qx - 6 * s, H * 0.82 - 30 * s, 12 * s, 20 * s);
      ctx.fillRect(qx - 4 * s, H * 0.82 - 40 * s, 8 * s, 10 * s);
    }
    ctx.fillStyle = "rgba(15,23,42,0.05)";
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }, []);

  // ---------- main loop (mode read from modeRef — no stale closures) ----------
  const loop = useCallback(() => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(loop); return; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const m = modeRef.current;

    if (m === "simulated") {
      simulateScene(ctx, performance.now());
    } else if (m === "opencv") {
      // draw the Python MJPEG stream frame onto the canvas (same-origin proxy → no canvas taint)
      try {
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } else {
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#67e8f9";
          ctx.font = "14px monospace";
          ctx.fillText("waiting for OpenCV stream…", 20, canvas.height / 2);
        }
      } catch { /* keep previous frame */ }
    } else {
      // webcam / upload — clear stale pixels so the old scene never lingers
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (video) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch { /* video not ready yet */ }
      }
    }

    // ---------- analysis ----------
    const py = pyAnalyzeRef.current;
    let res: DetectResult;
    const nowMs = Date.now();

    if (m === "opencv") {
      // Python is the source of truth; still run client-side zone/tripwire on the same pixels
      if (!workRef.current) workRef.current = document.createElement("canvas");
      const work = workRef.current;
      work.width = 160; work.height = 90;
      const wctx = work.getContext("2d", { willReadFrequently: true });
      if (wctx) {
        try {
          wctx.drawImage(canvas, 0, 0, 160, 90);
          const id = wctx.getImageData(0, 0, 160, 90);
          const base = analyzeFrame(id.data, 160, 90, {
            prevFrame: prevRef.current, sensitivity: sens, zone, tripwire,
            prevBrightness: prevBrightRef.current, lastMotionAt: lastMotionAtRef.current, now: performance.now(),
          });
          prevRef.current = new Uint8ClampedArray(id.data);
          prevBrightRef.current = base.brightness;
          if (base.motion) lastMotionAtRef.current = performance.now();
          // merge: python faces/motion win, client supplies zone/tripwire/tamper
          res = {
            ...base,
            motion: base.motion || (py?.motion ?? false),
            motionScore: Math.max(base.motionScore, py?.motionScore ?? 0),
            brightness: py?.brightness ?? base.brightness,
            persons: base.persons.length ? base.persons : (py?.persons ?? []),
          };
        } catch {
          res = { ...EMPTY_RESULT, motion: py?.motion ?? false, persons: py?.persons ?? [], brightness: py?.brightness ?? 0 };
        }
      } else {
        res = { ...EMPTY_RESULT, motion: py?.motion ?? false, persons: py?.persons ?? [], brightness: py?.brightness ?? 0 };
      }
    } else {
      if (!workRef.current) workRef.current = document.createElement("canvas");
      const work = workRef.current;
      work.width = 160; work.height = 90;
      const wctx = work.getContext("2d", { willReadFrequently: true });
      if (!wctx) { rafRef.current = requestAnimationFrame(loop); return; }
      wctx.drawImage(canvas, 0, 0, 160, 90);
      const id = wctx.getImageData(0, 0, 160, 90);
      res = analyzeFrame(id.data, 160, 90, {
        prevFrame: prevRef.current, sensitivity: sens, zone, tripwire,
        prevBrightness: prevBrightRef.current, lastMotionAt: lastMotionAtRef.current, now: performance.now(),
      });
      prevRef.current = new Uint8ClampedArray(id.data);
      prevBrightRef.current = res.brightness;
      if (res.motion) lastMotionAtRef.current = performance.now();
    }
    setResult(res);

    // ---------- live face recognition ----------
    if (m === "opencv") {
      // Python already classified faces — map into LiveFace shape
      const faces: LiveFace[] = (py?.faces ?? []).slice(0, 4).map((f) => ({
        box: f.box, family: f.family, name: f.name, similarity: f.similarity,
        rgb: [], width: 0, height: 0,
      }));
      setLiveFaces((prev) => (JSON.stringify(prev.map(({ rgb, ...r }) => r)) === JSON.stringify(faces.map(({ rgb, ...r }) => r)) ? prev : faces));
      if (faces.length && nowMs - lastFaceCheckAtRef.current > 3000) {
        lastFaceCheckAtRef.current = nowMs;
        // extract fresh crops (for enrollment + capture payloads)
        for (const f of faces) {
          const crop = extractFaceRGB(canvas, f.box, 32);
          if (crop) { f.rgb = crop.rgb; f.width = crop.width; f.height = crop.height; }
        }
      }
    } else if (res.persons.length && nowMs - lastFaceCheckAtRef.current > 1200 && canvas.width > 0) {
      lastFaceCheckAtRef.current = nowMs;
      const faces: LiveFace[] = [];
      for (const p of res.persons.slice(0, 2)) {
        const faceBox = { x: p.x + p.w * 0.15, y: p.y, w: p.w * 0.7, h: Math.min(p.h * 0.45, p.w) };
        const crop = extractFaceRGB(canvas, faceBox, 32);
        if (!crop) continue;
        faces.push({ box: faceBox, family: false, name: null, similarity: 0, rgb: crop.rgb, width: crop.width, height: crop.height });
      }
      if (faces.length && vault.length) {
        Promise.all(faces.map(async (f) => {
          const mk = await matchFaceOnBackend({ rgb: f.rgb, width: f.width, height: f.height });
          if (mk) { f.family = mk.family; f.name = mk.best?.name ?? null; f.similarity = mk.best?.similarity ?? 0; }
          return f;
        })).then(setLiveFaces).catch(() => undefined);
      } else {
        setLiveFaces(faces);
      }
    } else if (!res.persons.length && !(py?.faces ?? []).length && liveFaces.length) {
      setLiveFaces([]);
    }

    // ---------- 10s heartbeat capture → area-mode policy ----------
    const curMode = areaModeRef.current;
    if (nowMs - lastCaptureAtRef.current >= 10000) {
      lastCaptureAtRef.current = nowMs;
      let payloadFaces: { box: LiveFace["box"]; rgb?: number[]; width?: number; height?: number }[] = [];
      if (m === "opencv") {
        payloadFaces = (py?.faces ?? []).slice(0, 4).map((f) => {
          const crop = extractFaceRGB(canvas, f.box, 32);
          return { box: f.box, rgb: crop?.rgb, width: crop?.width, height: crop?.height };
        });
      } else {
        payloadFaces = liveFaces.length
          ? liveFaces.map((f) => ({ box: f.box, rgb: f.rgb, width: f.width, height: f.height }))
          : res.persons.slice(0, 2).map((p) => {
              const box = { x: p.x + p.w * 0.15, y: p.y, w: p.w * 0.7, h: Math.min(p.h * 0.45, p.w) };
              const crop = extractFaceRGB(canvas, box, 32);
              return crop ? { box, rgb: crop.rgb, width: crop.width, height: crop.height } : null;
            }).filter(Boolean) as { box: LiveFace["box"]; rgb: number[]; width: number; height: number }[];
      }
      fetch("/backend/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cameraId: (m === "opencv" ? "CAM-PC" : "CAM-LAB") + "-" + curMode.toUpperCase().slice(0, 3),
          mode: curMode,
          image: canvasToDataURL(canvas, 0.5),
          motion: res.motion,
          persons: res.persons.length,
          faces: payloadFaces,
        }),
      }).then((r) => r.json())
        .then((r: { stored: boolean; reason: string; intrusion: boolean }) => {
          setCaptureState(r.stored ? `stored — ${r.reason}` : `NOT stored — ${r.reason}`);
          log(
            r.intrusion ? `🚨 INTRUSION [${curMode}] — ${r.reason}`
            : r.stored ? `📹 [${curMode}] stored — ${r.reason}`
            : `🔒 [${curMode}] suppressed — ${r.reason}`,
            r.intrusion ? "critical" : r.stored ? "info" : "medium"
          );
        })
        .catch(() => setCaptureState("capture failed"));
    }

    // ---------- area-mode intrusion detection (family / restricted / public) ----------
    const faceClasses = m === "opencv"
      ? (py?.faces ?? []).map((f) => ({ family: f.family }))
      : liveFaces.map((f) => ({ family: f.family }));
    const area = areaIntrusion(curMode, res, faceClasses);
    areaIntrudedRef.current = area.intrusion;
    // 20s intrusion cooldown — one alarm, then 20s of silence
    const INTRUSION_COOLDOWN_MS = 20000;
    if (area.intrusion && armed && nowMs - areaAlertRef.current > INTRUSION_COOLDOWN_MS) {
      areaAlertRef.current = nowMs;
      const payload = {
        cameraId: (m === "opencv" ? "CAM-PC" : "CAM-LAB") + "-" + curMode.toUpperCase().slice(0, 3),
        type: curMode === "restricted" ? "restricted_entry" : "intrusion",
        title: curMode === "restricted" ? "RESTRICTED AREA BREACH — someone is there"
          : curMode === "family" ? "INTRUSION — unknown person in family area"
          : "Public area event",
        severity: area.severity,
        riskScore: curMode === "restricted" ? 95 : 85,
        description: `Area mode: ${curMode} · ${area.label}`,
        source: m === "opencv" ? "webcam" : m,
        zone: curMode,
        frames: 14,
        framePayload: JSON.stringify({
          areaMode: curMode, label: area.label, engine: m,
          faces: faceClasses, motion: res.motion, ts: new Date().toISOString(),
        }),
      };
      onIncident(payload)
        .then(() => {
          log(`🚨 AREA ALERT [${curMode.toUpperCase()}] — ${area.label}`, area.severity);
          setIncidentsFired((n) => n + 1);
        })
        .catch(() => log("area alert failed", "critical"));
    }

    // ---------- CV incident triggers (per-type cooldowns, zone/tripwire/tamper) ----------
    const { score, severity, reasons } = scoreEvent(res, { armed, hasZone: Boolean(zone) });
    if (armed && score >= riskThreshold) {
      const type = res.tamper.detected ? "camera_tamper" : res.zoneOccupied ? "restricted_entry" : res.crossedTripwire ? "tripwire" : res.persons.length ? "person_detected" : "motion";
      const cooldowns: Record<string, { ref: React.MutableRefObject<number>; ms: number } | undefined> = {
        tripwire: { ref: tripwireFiredRef, ms: 10000 },
        restricted_entry: { ref: zoneFiredRef, ms: 10000 },
        person_detected: { ref: personFiredRef, ms: 20000 },
        motion: { ref: motionFiredRef, ms: 20000 },
      };
      const cd = cooldowns[type];
      const canFire = !cd || nowMs - cd.ref.current > cd.ms;
      if (canFire) {
        if (cd) cd.ref.current = nowMs;
        const payload = {
          cameraId: m === "opencv" ? "CAM-PC" : "CAM-LAB",
          type,
          title:
            type === "restricted_entry" ? "Person entered restricted zone"
            : type === "tripwire" ? "Tripwire crossed"
            : type === "camera_tamper" ? `Camera tamper: ${res.tamper.type}`
            : res.persons.length ? "Person detected"
            : "Motion detected",
          severity,
          riskScore: score,
          description: `Detection Lab (${m}) · ${reasons.join(", ") || type}`,
          source: m === "opencv" ? "webcam" : m,
          zone: res.zoneOccupied ? "restricted" : null,
          frames: Math.max(6, Math.round(score / 4)),
          framePayload: JSON.stringify({
            lab: true, cameraId: m === "opencv" ? "CAM-PC" : "CAM-LAB", type, score, severity, reasons, engine: m,
            persons: res.persons, motion: res.motionScore, tamper: res.tamper,
            faces: (m === "opencv" ? (py?.faces ?? []) : liveFaces).map((f: { family?: boolean; name?: string | null; similarity?: number }) => ({ family: f.family, name: f.name, similarity: f.similarity })),
            ts: new Date().toISOString(),
          }),
        };
        onIncident(payload)
          .then(() => {
            log(`🚨 ${payload.title} — risk ${score}/100 → hashed + anchored`, severity);
            setIncidentsFired((n) => n + 1);
          })
          .catch(() => log("incident pipeline failed", "critical"));
      }
    }

    drawOverlays(ctx, res, zone, tripwire, armed, liveFaces, m);
    rafRef.current = requestAnimationFrame(loop);
  }, [sens, zone, tripwire, armed, riskThreshold, onIncident, simulateScene, vault, liveFaces]);

  const loopRef = useRef(loop);
  useEffect(() => { loopRef.current = loop; }, [loop]);

  const ensureRunning = () => {
    if (!runningRef.current) {
      runningRef.current = true;
      setRunning(true);
      lastCaptureAtRef.current = 0;
      rafRef.current = requestAnimationFrame(loopRef.current);
    }
  };

  // ---------- source switching (instant, no stale frames) ----------
  const setSource = (m: FeedMode) => {
    modeRef.current = m;
    setMode(m);
    prevRef.current = null;
    prevBrightRef.current = 0;
  };

  const startStop = () => {
    if (running) {
      runningRef.current = false;
      setRunning(false);
      cancelAnimationFrame(rafRef.current);
      stopMedia();
      setLiveFaces([]);
      pyAnalyzeRef.current = null;
      log("feed stopped", "info");
    } else {
      setSource("simulated");
      ensureRunning();
      log("simulated feed started — detection live", "success");
    }
  };

  const startWebcam = async () => {
    stopMedia();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setSource("webcam");
      ensureRunning();
      log("webcam stream started — LIVE camera image + recognition", "success");
    } catch {
      log("webcam denied or busy — try 'PC Camera (OpenCV)' instead", "high");
    }
  };

  const startOpenCv = () => {
    stopMedia();
    if (imgRef.current) {
      imgRef.current.src = `${VISION_BASE}/stream?t=${Date.now()}`; // cache-buster
    }
    setSource("opencv");
    ensureRunning();
    // poll the Python analyzer
    if (pyPollRef.current) clearInterval(pyPollRef.current);
    const poll = () =>
      fetch(`${VISION_BASE}/analyze`)
        .then((r) => r.json())
        .then((a: PyAnalyze) => { pyAnalyzeRef.current = a; })
        .catch(() => { pyAnalyzeRef.current = null; });
    poll();
    pyPollRef.current = setInterval(poll, 500);
    log("PC camera via Python OpenCV — Haar faces + family recognition live", "success");
  };

  const startUpload = (f: File) => {
    stopMedia();
    const url = URL.createObjectURL(f);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.loop = true;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => undefined);
    }
    setSource("upload");
    ensureRunning();
    log(`video source loaded: ${f.name}`, "info");
  };

  const stopMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("src");
    }
    if (imgRef.current) imgRef.current.src = "";
    if (pyPollRef.current) { clearInterval(pyPollRef.current); pyPollRef.current = 0; }
  }, []);

  useEffect(() => () => { runningRef.current = false; cancelAnimationFrame(rafRef.current); stopMedia(); }, [stopMedia]);

  // ---------- drawing rules on canvas ----------
  const toNorm = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };
  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawMode === "none") return;
    dragRef.current = toNorm(e);
  };
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || drawMode === "none") return;
    const p = toNorm(e);
    if (drawMode === "zone")
      setZone({ x: Math.min(dragRef.current.x, p.x), y: Math.min(dragRef.current.y, p.y), w: Math.abs(p.x - dragRef.current.x), h: Math.abs(p.y - dragRef.current.y) });
    else setTripwire({ x1: dragRef.current.x, y1: dragRef.current.y, x2: p.x, y2: p.y });
  };
  const onUp = () => {
    if (drawMode === "zone" && zone && (zone.w < 0.03 || zone.h < 0.03)) setZone(null);
    dragRef.current = null;
    if (drawMode === "zone" && zone) log(`restricted zone set (${Math.round(zone.w * 100)}% × ${Math.round(zone.h * 100)}%)`, "info");
    if (drawMode === "tripwire" && tripwire) log("tripwire armed", "info");
  };

  const riskNow = scoreEvent(result, { armed, hasZone: Boolean(zone) }).score;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="card p-4">
        {/* controls */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Btn variant={running ? "danger" : "primary"} onClick={startStop}>
            {running ? <Square size={14} /> : <MonitorPlay size={14} />} {running ? "Stop" : "Simulated Feed"}
          </Btn>
          <Btn variant="ghost" onClick={startWebcam}><Video size={14} /> Webcam</Btn>
          <Btn variant={mode === "opencv" ? "primary" : "ghost"} onClick={startOpenCv} title="Python OpenCV: real Haar face detection + family recognition">
            <Cpu size={14} /> PC Camera (OpenCV)
            <span className={`h-1.5 w-1.5 rounded-full ${visionOnline ? "bg-lime-400" : "bg-slate-300"}`} />
          </Btn>
          <Btn variant="ghost" onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload Video</Btn>
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && startUpload(e.target.files[0])} />
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span>Sensitivity</span>
            <input type="range" min={1} max={100} value={sens} onChange={(e) => setSens(Number(e.target.value))} className="w-28 accent-cyan-600" />
            <span className="mono text-cyan-700">{sens}</span>
          </div>
        </div>

        {/* feed */}
        <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-900 scanline">
          {mode === "opencv" && !visionOnline && (
            <div className="absolute inset-x-0 top-0 z-10 bg-rose-600/90 text-white text-[11px] font-semibold px-3 py-1.5">
              Python vision offline — start it: <code className="mono">cd backend/python && python vision_server.py</code>
            </div>
          )}
          {mode === "opencv" && visionOnline && (
            <div className="absolute inset-x-0 top-0 z-10 bg-slate-950/85 text-cyan-200 text-[11px] font-semibold px-3 py-1.5">
              ⚠ Camera busy? Click <b>Stop</b> on any other feed (or close other tabs using the webcam) — Windows gives one app the camera at a time. The OpenCV engine grabs it automatically once free.
            </div>
          )}
          <canvas ref={canvasRef} width={640} height={360}
            className={`w-full block ${drawMode !== "none" ? "cursor-crosshair" : ""}`}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} />
          {/* MJPEG stream element — drawn onto the canvas each frame (opencv mode) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} alt="" className="hidden" />
          <video ref={videoRef} className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" playsInline muted />
          <div className="absolute top-2 left-2 flex items-center gap-2 text-[10px] mono font-bold flex-wrap">
            <span className={`px-2 py-0.5 rounded ${running ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              {running ? "● LIVE ANALYSIS" : "PAUSED"}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950/80 text-cyan-300">
              {mode === "opencv" ? "PC CAMERA · OPENCV" : mode.toUpperCase()}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950/80 text-slate-200">LUMA {result.brightness}</span>
          </div>
          {!running && (
            <div className="absolute inset-0 grid place-items-center text-slate-300 text-sm bg-slate-950/70">
              <div className="text-center">
                <Camera size={28} className="mx-auto mb-2 opacity-60" />
                Pick a source — Simulated, Webcam, or <b>PC Camera (OpenCV)</b> for your real camera
                with Haar face detection.
              </div>
            </div>
          )}
        </div>

        {/* area mode selector */}
        <div className="mt-3 rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert size={13} className="text-slate-500" />
            <span className="text-[11px] uppercase tracking-[0.16em] font-bold text-slate-500">Area mode — who gets an alarm</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { m: "family" as AreaMode, icon: Home, title: "Family", desc: "Alert only if a stranger is here WITHOUT family" },
              { m: "restricted" as AreaMode, icon: ShieldBan, title: "Restricted", desc: "Alarm on ANY presence — even family" },
              { m: "public" as AreaMode, icon: Globe, title: "Public", desc: "No alarms — SHA-256 hash chain only" },
            ]).map(({ m: am, icon: Icon, title, desc }) => (
              <button key={am} title={desc}
                onClick={() => { setAreaMode(am); areaModeRef.current = am; areaAlertRef.current = 0; log(`area mode → ${am.toUpperCase()}`, "info"); }}
                className={`rounded-xl border-2 p-2.5 text-left transition-all ${areaMode === am ? "border-cyan-500 bg-cyan-50 shadow-sm" : "border-slate-200 bg-white hover:border-cyan-300"}`}>
                <div className={`flex items-center gap-1.5 text-xs font-extrabold ${areaMode === am ? "text-cyan-800" : "text-slate-600"}`}>
                  <Icon size={13} /> {title}
                </div>
                <div className="text-[10px] text-slate-500 leading-snug mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-slate-500 mono">
            active: <span className="font-bold text-cyan-700">{areaMode.toUpperCase()}</span>
            {areaMode === "family" && " — stranger+family together = NO alarm; stranger alone = ALARM"}
            {areaMode === "restricted" && " — any motion/face/trespass = ALARM (even family)"}
            {areaMode === "public" && " — never alarms; every 10s frame is hash-chained, edits detected"}
          </div>
        </div>

        {/* rules row */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Btn variant={drawMode === "zone" ? "primary" : "ghost"} onClick={() => setDrawMode(drawMode === "zone" ? "none" : "zone")}>
            <Crosshair size={14} /> Draw Restricted Zone
          </Btn>
          <Btn variant={drawMode === "tripwire" ? "primary" : "ghost"} onClick={() => setDrawMode(drawMode === "tripwire" ? "none" : "tripwire")}>
            <ShieldAlert size={14} /> Draw Tripwire
          </Btn>
          <Btn variant="ghost" onClick={() => { setZone(null); setTripwire(null); }}>Clear Rules</Btn>
          <Btn variant={armed ? "success" : "ghost"} onClick={() => setArmed(!armed)}>
            {armed ? <Lock size={13} /> : <Unlock size={13} />} {armed ? "Armed" : "Disarmed"}
          </Btn>
          <Btn variant="ghost" onClick={() => { prevRef.current = null; prevBrightRef.current = 0; lastMotionAtRef.current = 0; log("baselines reset", "info"); }} title="Re-baseline tamper detection">
            <Eye size={14} /> Re-baseline
          </Btn>
        </div>

        {/* readout */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 text-center">
          {[
            ["Motion", result.motion ? "YES" : "no", result.motion],
            ["Persons", String(result.persons.length), result.persons.length > 0],
            ["Zone", result.zoneOccupied ? "BREACH" : "clear", result.zoneOccupied],
            ["Tripwire", result.crossedTripwire ? "CROSS" : "clear", result.crossedTripwire],
            ["Tamper", result.tamper.detected ? result.tamper.type ?? "yes" : "none", result.tamper.detected],
            ["Risk", `${riskNow}/${riskThreshold}`, riskNow >= riskThreshold],
          ].map(([label, value, hot]) => (
            <div key={String(label)} className={`rounded-xl border px-2 py-1.5 ${hot ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
              <div className="text-[10px] uppercase tracking-wider font-bold">{label}</div>
              <div className="text-xs mono font-bold truncate">{String(value)}</div>
            </div>
          ))}
        </div>

        {/* live face recognition strip */}
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Users size={13} className="text-cyan-700" />
            <span className="text-[11px] uppercase tracking-[0.16em] font-bold text-slate-500">Live face recognition</span>
            <span className="chip bg-white border border-slate-200 text-slate-500 text-[10px]">{vault.length} enrolled</span>
            {mode === "opencv" && (
              <span className={`chip text-[10px] border ${visionOnline ? "bg-lime-50 text-lime-700 border-lime-200" : "bg-rose-50 text-rose-600 border-rose-200"}`}>
                <Cpu size={10} className="mr-1" /> python {visionOnline ? "online" : "offline"}
              </span>
            )}
            {captureState !== "idle" && (
              <span className={`ml-auto chip text-[10px] border ${captureState.startsWith("stored") ? "bg-lime-50 text-lime-700 border-lime-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                <Radio size={10} className="mr-1" /> 10s booth: {captureState}
              </span>
            )}
          </div>
          {liveFaces.length === 0 ? (
            <p className="text-xs text-slate-400">No faces in frame {vault.length === 0 && "— enroll family members so the privacy gate can recognize them"}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {liveFaces.map((f, i) => (
                <div key={i} className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-xs ${f.family ? "border-lime-300 bg-lime-50 text-lime-800" : "border-rose-300 bg-rose-50 text-rose-700"}`}>
                  {f.family ? "👨‍👩‍👧" : "🕵️"}
                  <span className="font-bold">{f.family ? `FAMILY · ${f.name}` : "STRANGER"}</span>
                  {f.similarity > 0 && <span className="mono text-[10px]">{(f.similarity * 100).toFixed(0)}%</span>}
                  {!f.family && f.rgb.length > 0 && (
                    <button onClick={() => setEnrollFace(f)} className="text-[10px] font-bold text-cyan-700 hover:underline">enroll</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* enrollment dialog */}
        {enrollFace && (
          <div className="mt-3 rounded-xl border-2 border-cyan-300 bg-cyan-50 p-3 flex items-center gap-3">
            <UserPlus size={18} className="text-cyan-700 shrink-0" />
            <div className="flex-1 grid grid-cols-2 gap-2">
              <input value={enrollName} onChange={(e) => setEnrollName(e.target.value)} placeholder="Name" className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
              <input value={enrollRelation} onChange={(e) => setEnrollRelation(e.target.value)} placeholder="Relation" className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
            <Btn variant="primary" onClick={enrollFromFace} disabled={!enrollName.trim()}>Enroll</Btn>
            <Btn variant="ghost" onClick={() => setEnrollFace(null)}>Cancel</Btn>
          </div>
        )}
      </div>

      {/* side panel */}
      <div className="flex flex-col gap-4">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400 font-bold mb-2">Detection events</div>
          <div className="space-y-1.5 max-h-48 overflow-auto">
            {eventLog.length === 0 && <div className="text-xs text-slate-400">No events yet — start a feed.</div>}
            {eventLog.map((e, i) => (
              <div key={i} className="text-xs flex gap-2 items-start">
                <span className="mono text-slate-400">{e.time}</span>
                <span className={e.sev === "critical" || e.sev === "high" ? "text-rose-600 font-semibold" : e.sev === "medium" ? "text-amber-600" : e.sev === "success" ? "text-lime-700" : "text-slate-600"}>{e.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-4 text-xs text-slate-600 leading-relaxed">
          <div className="text-slate-900 font-bold mb-1.5">Pipeline</div>
          Detection fires incidents above <span className="mono font-bold">{riskThreshold}</span> risk. Each flows:
          <span className="font-semibold text-cyan-700"> SHA-256 → MST anchor → agent quorum → alert</span>.
          Incidents fired this session: <span className="mono font-bold text-cyan-700">{incidentsFired}</span>.
          <div className="mt-2 pt-2 border-t border-slate-100">
            <span className="font-bold text-slate-800">Privacy gate:</span> every 10s a frame is hashed + stored —
            but only while a <span className="font-semibold text-rose-600">non-family</span> person is present.
            Family-only frames are <span className="font-semibold">never stored</span>.
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100">
            <span className="font-bold text-slate-800">PC Camera (OpenCV):</span> Python service owns the real camera —
            MJPEG stream, Haar face detection, family matching. Enrollments apply to both engines instantly.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- overlay painter ---------------- */
function drawOverlays(
  ctx: CanvasRenderingContext2D,
  res: DetectResult,
  zone: { x: number; y: number; w: number; h: number } | null,
  tripwire: { x1: number; y1: number; x2: number; y2: number } | null,
  armed: boolean,
  faces: LiveFace[],
  mode: FeedMode
) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.save();
  if (zone) {
    ctx.strokeStyle = "rgba(225,29,72,0.95)";
    ctx.fillStyle = "rgba(225,29,72,0.10)";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2.5;
    ctx.fillRect(zone.x * W, zone.y * H, zone.w * W, zone.h * H);
    ctx.strokeRect(zone.x * W, zone.y * H, zone.w * W, zone.h * H);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(190,18,60,0.95)";
    ctx.font = "bold 10px monospace";
    ctx.fillText("RESTRICTED ZONE", zone.x * W + 4, zone.y * H + 12);
  }
  if (tripwire) {
    ctx.strokeStyle = "rgba(8,145,178,0.95)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tripwire.x1 * W, tripwire.y1 * H);
    ctx.lineTo(tripwire.x2 * W, tripwire.y2 * H);
    ctx.stroke();
    ctx.fillStyle = "rgba(8,145,178,0.95)";
    ctx.font = "bold 10px monospace";
    ctx.fillText("TRIPWIRE", tripwire.x1 * W + 4, tripwire.y1 * H - 4);
  }
  // In opencv mode python already painted its own boxes into the stream image;
  // skip client person boxes to avoid duplicates, but still show client face tags.
  if (mode !== "opencv") {
    for (const p of res.persons) {
      ctx.strokeStyle = "rgba(101,163,13,0.95)";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(p.x * W, p.y * H, p.w * W, p.h * H);
      ctx.fillStyle = "rgba(101,163,13,0.95)";
      ctx.font = "bold 10px monospace";
      ctx.fillText(`PERSON ${(p.conf * 100).toFixed(0)}%`, p.x * W, Math.max(10, p.y * H - 4));
    }
  }
  for (const f of faces) {
    if (mode === "opencv" && f.family === false && f.similarity === 0) continue; // python draws its own
    ctx.strokeStyle = f.family ? "rgba(101,163,13,0.95)" : "rgba(225,29,72,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(f.box.x * W, f.box.y * H, f.box.w * W, f.box.h * H);
    ctx.fillStyle = f.family ? "rgba(101,163,13,0.95)" : "rgba(225,29,72,0.95)";
    ctx.font = "bold 10px monospace";
    ctx.fillText(f.family ? `${f.name} · FAMILY` : "UNKNOWN", f.box.x * W, Math.max(10, f.box.y * H - 3));
  }
  if (res.tamper.detected) {
    ctx.fillStyle = "rgba(225,29,72,0.92)";
    ctx.fillRect(0, 0, W, 26);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`⚠ CAMERA TAMPER: ${res.tamper.type!.toUpperCase()}`, 10, 17);
  }
  ctx.fillStyle = armed ? "rgba(101,163,13,0.95)" : "rgba(100,116,139,0.8)";
  ctx.font = "bold 10px monospace";
  ctx.fillText(armed ? "ARMED" : "DISARMED", W - 62, H - 8);
  ctx.restore();
}
