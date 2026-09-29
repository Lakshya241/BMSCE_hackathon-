import { Router } from "express";
import { appendJSON, deleteById, readJSON, updateById, updateJSON, writeJSON } from "../lib/db";
import { nextId } from "../lib/crypto";
import { createIncident, reverifyEvidence, tamperEvidence } from "../lib/incidents";
import { getBlockchainState, registerVerifierOnChain } from "../lib/blockchain";
import { buildAnalytics } from "../lib/analytics";
import { emitEvent } from "../lib/bus";
import {
  listFamily, addFamilyMember, removeFamilyMember, matchFace, familyCount, signatureFromRGB,
  type FaceSignature,
} from "../lib/family";
import {
  ingestCapture, listCaptures, getCapture, removeCapture, clearCaptures, captureStats, verifyCaptureChain,
} from "../lib/captures";
import type { Alert, Camera, ChainNode, Incident, Settings, Severity, Verification } from "../lib/types";

export const router = Router();

// ---------------- health ----------------
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "chain-sentry-backend", time: new Date().toISOString() });
});

// ---------------- aggregated state ----------------
router.get("/state", (_req, res) => {
  res.json({
    cameras: readJSON<Camera[]>("cameras", []),
    incidents: readJSON<Incident[]>("incidents", []),
    alerts: readJSON<Alert[]>("alerts", []),
    evidence: readJSON("evidence", []),
    transactions: readJSON("transactions", []),
    nodes: readJSON<ChainNode[]>("nodes", []),
    verifications: readJSON<Verification[]>("verifications", []),
    activity: readJSON("activity", []),
    family: listFamily(),
    captures: listCaptures(20),
    captureStats: captureStats(),
    settings: readJSON<Settings>("settings", {} as Settings),
    blockchain: getBlockchainState(),
    analytics: buildAnalytics(),
    stats: (() => {
      const incidents = readJSON<Incident[]>("incidents", []) as Incident[];
      const txs = readJSON<{ status: string }[]>("transactions", []) as { status: string }[];
      const ev = readJSON<{ tampered: boolean }[]>("evidence", []) as { tampered: boolean }[];
      return {
        totalIncidents: incidents.length,
        activeIncidents: incidents.filter((i) => i.status === "active").length,
        verified: incidents.filter((i) => i.verificationStatus === "verified").length,
        tampered: ev.filter((e) => e.tampered).length,
        totalTx: txs.length,
        confirmedTx: txs.filter((t) => t.status === "confirmed").length,
      };
    })(),
    serverTime: new Date().toISOString(),
  });
});

// ---------------- incidents ----------------
router.get("/incidents", (_req, res) => res.json(readJSON<Incident[]>("incidents", [])));

router.post("/incidents", async (req, res) => {
  const b = req.body ?? {};
  if (!b.cameraId || !b.type) return res.status(400).json({ error: "cameraId and type are required" });
  const incident = await createIncident({
    cameraId: String(b.cameraId),
    type: String(b.type),
    title: String(b.title ?? b.type),
    severity: (["low", "medium", "high", "critical"].includes(b.severity) ? b.severity : "medium") as Severity,
    riskScore: Number(b.riskScore ?? 60),
    description: String(b.description ?? ""),
    source: b.source,
    zone: b.zone ?? null,
    frames: b.frames ? Number(b.frames) : undefined,
    framePayload: b.framePayload,
  });
  res.status(201).json(incident);
});

router.patch("/incidents", (req, res) => {
  const { id, ...patch } = req.body ?? {};
  if (!id) return res.status(400).json({ error: "id required" });
  const updated = updateById<Incident>("incidents", id, patch);
  if (!updated) return res.status(404).json({ error: "incident not found" });
  emitEvent({ kind: "activity", level: "info", message: `Incident ${id} status → ${updated.status}` });
  res.json(updated);
});

// ---------------- evidence ----------------
router.get("/evidence", (_req, res) => res.json(readJSON("evidence", [])));

router.post("/evidence", (req, res) => {
  const b = req.body ?? {};
  if (b.action === "tamper" && b.incidentId) {
    const r = tamperEvidence(String(b.incidentId), String(b.method ?? "frame_splice"));
    if (!r) return res.status(400).json({ error: "evidence not found or already tampered" });
    return res.json({ ok: true, ...r });
  }
  if (b.action === "reverify" && b.incidentId) {
    return res.json({ ok: true, intact: reverifyEvidence(String(b.incidentId)) });
  }
  if (b.action === "verify" && typeof b.hash === "string" && b.hash.length === 64) {
    const all = readJSON<{ id: string; incidentId: string; originalHash: string; currentHash: string; tampered: boolean }[]>("evidence", []) as {
      id: string; incidentId: string; originalHash: string; currentHash: string; tampered: boolean;
    }[];
    const e = all.find((x) => x.originalHash === b.hash || x.currentHash === b.hash);
    if (!e) return res.json({ found: false });
    return res.json({
      found: true, evidenceId: e.id, incidentId: e.incidentId, tampered: e.tampered,
      intact: e.currentHash === e.originalHash, evidence: e,
    });
  }
  res.status(400).json({ error: "unknown action" });
});

// ---------------- family face vault ----------------
router.get("/family", (_req, res) => res.json({ members: listFamily(), count: familyCount() }));

router.post("/family", (req, res) => {
  const b = req.body ?? {};
  if (!b.name || !b.relation || !b.photo) {
    return res.status(400).json({ error: "name, relation and photo are required" });
  }
  if (!String(b.photo).startsWith("data:image/")) {
    return res.status(400).json({ error: "photo must be a data:image/* URL" });
  }
  let sig = b.signature as FaceSignature | undefined;
  if (!sig && Array.isArray(b.rgb) && b.width && b.height) {
    sig = signatureFromRGB(b.rgb as number[], Number(b.width), Number(b.height));
  }
  if (!sig || !Array.isArray(sig.grid) || sig.grid.length !== 25 || !Array.isArray(sig.hue) || sig.hue.length !== 24) {
    return res.status(400).json({ error: "send signature {grid[25],hue[24]} or face pixels {rgb,width,height}" });
  }
  const member = addFamilyMember({
    name: String(b.name),
    relation: String(b.relation),
    signature: sig,
    photo: String(b.photo),
    photoRaw: b.photoRaw ? String(b.photoRaw) : undefined,
  });
  res.status(201).json(member);
});

router.delete("/family/:id", (req, res) => {
  const ok = removeFamilyMember(req.params.id);
  if (!ok) return res.status(404).json({ error: "family member not found" });
  res.json({ ok: true });
});

/** Match a face against the vault — accepts a precomputed signature OR raw rgb pixels. */
router.post("/family/match", (req, res) => {
  const b = req.body ?? {};
  let sig = b.signature as FaceSignature | undefined;
  if (!sig && Array.isArray(b.rgb) && b.width && b.height) {
    sig = signatureFromRGB(b.rgb as number[], Number(b.width), Number(b.height));
  }
  if (!sig || !Array.isArray(sig.grid) || !Array.isArray(sig.hue)) {
    return res.status(400).json({ error: "send signature {grid,hue} or rgb pixels {rgb,width,height}" });
  }
  const matches = matchFace(sig);
  const best = matches[0] ?? null;
  const THRESHOLD = 0.82;
  res.json({
    family: Boolean(best && best.similarity >= THRESHOLD),
    threshold: THRESHOLD,
    best,
    matches: matches.slice(0, 3),
    vaultSize: familyCount(),
  });
});

// ---------------- captures (10s rolling booth, privacy-gated) ----------------
router.get("/captures", (_req, res) => res.json({ captures: listCaptures(30), stats: captureStats() }));

router.post("/captures", (req, res) => {
  const b = req.body ?? {};
  const r = ingestCapture({
    cameraId: String(b.cameraId ?? "CAM-LAB"),
    mode: (b.mode ?? "family") as "family" | "restricted" | "public",
    image: String(b.image ?? ""),
    motion: Boolean(b.motion),
    persons: Number(b.persons ?? 0),
    faces: Array.isArray(b.faces) ? b.faces : [],
  });
  res.json(r);
});

/** Verify the tamper-evident hash chain of all stored captures. */
router.get("/captures/verify", (_req, res) => {
  res.json(verifyCaptureChain());
});

router.get("/captures/:id", (req, res) => {
  const c = getCapture(req.params.id);
  if (!c) return res.status(404).json({ error: "capture not found" });
  res.json(c);
});

router.delete("/captures/:id", (req, res) => {
  const ok = removeCapture(req.params.id);
  if (!ok) return res.status(404).json({ error: "capture not found" });
  res.json({ ok: true });
});

router.post("/captures/clear", (_req, res) => {
  res.json({ ok: true, removed: clearCaptures() });
});

// ---------------- cameras ----------------
router.get("/cameras", (_req, res) => res.json(readJSON<Camera[]>("cameras", [])));

router.post("/cameras", (req, res) => {
  const b = req.body ?? {};
  if (!b.name || !b.location) return res.status(400).json({ error: "name and location are required" });
  const num = (readJSON<Camera[]>("cameras", []) as Camera[]).length + 1;
  const camera: Camera = {
    id: `CAM-${String(num).padStart(3, "0")}`,
    name: String(b.name).slice(0, 60),
    location: String(b.location).slice(0, 80),
    status: "online",
    mode: b.mode === "disarmed" ? "disarmed" : "armed",
    riskLevel: "low",
    lastSeen: new Date().toISOString(),
    uptime: 100,
    tamperCount: 0,
    latencyMs: 40 + Math.floor(Math.random() * 40),
    model: b.model || "Sentry-Cam X2",
    wallet: null,
  };
  appendJSON("cameras", camera, 100);
  emitEvent({ kind: "camera_update", level: "info", message: `Camera registered: ${camera.name} (${camera.id})` });
  res.status(201).json(camera);
});

router.patch("/cameras", (req, res) => {
  const { id, ...patch } = req.body ?? {};
  if (!id) return res.status(400).json({ error: "id required" });
  const updated = updateById<Camera>("cameras", id, patch);
  if (!updated) return res.status(404).json({ error: "camera not found" });
  if (patch.status === "compromised") {
    emitEvent({ kind: "camera_tamper", level: "critical", message: `⚠ Camera ${updated.name} (${id}) TAMPERED — signal lost, mesh re-routing`, data: { cameraId: id } });
    appendJSON("activity", { id: nextId("ACT"), kind: "camera_tamper", message: `Camera tamper detected on ${id}`, level: "critical", timestamp: new Date().toISOString() }, 300);
  } else {
    emitEvent({ kind: "camera_update", level: "info", message: `Camera ${updated.name} updated (${patch.mode ?? patch.status ?? "patch"})` });
  }
  res.json(updated);
});

router.delete("/cameras/:id", (req, res) => {
  deleteById<Camera>("cameras", req.params.id);
  res.json({ ok: true });
});

// ---------------- alerts ----------------
router.get("/alerts", (_req, res) => res.json(readJSON<Alert[]>("alerts", [])));

router.post("/alerts", (req, res) => {
  const b = req.body ?? {};
  if (!b.title) return res.status(400).json({ error: "title required" });
  const alert: Alert = {
    id: nextId("ALR"),
    incidentId: b.incidentId ?? undefined,
    title: String(b.title).slice(0, 120),
    message: String(b.message ?? "").slice(0, 400),
    severity: b.severity ?? "medium",
    acknowledged: false,
    createdAt: new Date().toISOString(),
    channel: b.channel ?? "dashboard",
  };
  appendJSON("alerts", alert, 200);
  emitEvent({ kind: "alert", level: alert.severity, message: alert.title });
  res.status(201).json(alert);
});

router.patch("/alerts", (req, res) => {
  const b = req.body ?? {};
  if (b.action === "ackAll") {
    updateJSON<Alert[]>("alerts", (arr) => arr.map((a) => ({ ...a, acknowledged: true })));
    return res.json({ ok: true });
  }
  if (!b.id) return res.status(400).json({ error: "id required" });
  updateById<Alert>("alerts", b.id, { acknowledged: true });
  res.json({ ok: true });
});

// ---------------- nodes (failover simulation) ----------------
router.get("/nodes", (_req, res) => res.json(readJSON<ChainNode[]>("nodes", [])));

router.post("/nodes", (req, res) => {
  const b = req.body ?? {};
  const nodes = readJSON<ChainNode[]>("nodes", []) as ChainNode[];
  if (b.action === "failover" && b.id) {
    const target = nodes.find((n) => n.id === b.id);
    if (!target) return res.status(404).json({ error: "node not found" });
    updateById<ChainNode>("nodes", b.id, { status: "offline" });
    const candidate = nodes
      .filter((n) => n.id !== b.id && n.status === "active" && (n.role === "verifier" || n.role === "validator"))
      .sort((a, c) => c.stake - a.stake)[0];
    if (candidate) updateById<ChainNode>("nodes", candidate.id, { status: "active" });
    appendJSON("activity", {
      id: nextId("ACT"), kind: "node_failover",
      message: `Node ${target.name} (${target.id}) offline — verification duty shifted to ${candidate?.name ?? "network consensus"}`,
      level: "high", timestamp: new Date().toISOString(),
    }, 300);
    emitEvent({
      kind: "node_failover", level: "high",
      message: `⚡ Node ${target.name} down — failover to ${candidate?.name ?? "consensus"} (${candidate?.id ?? "n/a"})`,
      data: { from: target.id, to: candidate?.id ?? null },
    });
    return res.json({ ok: true, failoverTo: candidate?.id ?? null });
  }
  if (b.action === "reactivate" && b.id) {
    updateById<ChainNode>("nodes", b.id, { status: "active", lastBlock: 4820341 });
    emitEvent({ kind: "node_failover", level: "info", message: `Node ${b.id} reactivated and syncing` });
    return res.json({ ok: true });
  }
  res.status(400).json({ error: "unknown action" });
});

// ---------------- settings ----------------
router.get("/settings", (_req, res) => res.json(readJSON<Settings>("settings", {} as Settings)));

router.patch("/settings", (req, res) => {
  const b = req.body ?? {};
  if (typeof b !== "object") return res.status(400).json({ error: "invalid body" });
  const current = readJSON<Settings>("settings", {} as Settings);
  const next: Settings = { ...current, ...b, updatedAt: new Date().toISOString() };
  writeJSON("settings", next);
  emitEvent({ kind: "settings_update", level: "info", message: `Settings updated (armed=${next.armed}, threshold=${next.riskThreshold})` });
  res.json(next);
});

// ---------------- transactions / blockchain ----------------
router.get("/blockchain", (_req, res) => {
  res.json({ ...getBlockchainState(), transactions: (readJSON("transactions", []) as unknown[]).slice(0, 50) });
});

router.post("/blockchain/register-verifier", async (req, res) => {
  const r = await registerVerifierOnChain(req.body?.cameraId);
  res.json(r);
});

// ---------------- analytics / activity ----------------
router.get("/analytics", (_req, res) => res.json(buildAnalytics()));
router.get("/activity", (_req, res) => res.json(readJSON("activity", [])));

// ---------------- demo theater (3-step hackathon story) ----------------
router.post("/demo", async (req, res) => {
  const step = Number(req.body?.step ?? 0);
  try {
    if (step === 0) {
      const cams = readJSON<Camera[]>("cameras", []) as Camera[];
      const cam = cams[0]?.id ?? "CAM-001";
      const incident = await createIncident({
        cameraId: cam, type: "restricted_entry", title: "Simulated: person entered restricted zone",
        severity: "high", riskScore: 91, description: "restricted zone breach at vault perimeter (demo theater)",
        source: "simulated", zone: "vault", frames: 18,
      });
      return res.json({ step, incident });
    }
    if (step === 1) {
      const incidents = readJSON<Incident[]>("incidents", []) as Incident[];
      const target = incidents.find((i) => i.verificationStatus === "verified") ?? incidents[0];
      if (!target) return res.status(400).json({ error: "run step 0 first" });
      const r = tamperEvidence(target.id);
      return res.json({ step, ...r });
    }
    if (step === 2) {
      const cams = readJSON<Camera[]>("cameras", []) as Camera[];
      const target = cams.find((c) => c.status === "online");
      if (!target) return res.status(400).json({ error: "no online camera" });
      updateById<Camera>("cameras", target.id, { status: "compromised" });
      emitEvent({ kind: "camera_tamper", level: "critical", message: `⚠ ${target.name} attacked — feed obstructed, failover engaged` });
      return res.json({ step, camera: target.id });
    }
    return res.status(400).json({ error: "step must be 0, 1 or 2" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
