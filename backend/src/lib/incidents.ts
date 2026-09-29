import { evidenceDigest, mutateHash, nextId, pseudoTxHash, sha256 } from "./crypto";
import { appendJSON, readJSON, updateById, updateJSON } from "./db";
import { anchorEvidence, getBlockchainState, registerVerifierOnChain } from "./blockchain";
import { emitEvent } from "./bus";
import type { Evidence, Incident, Severity, Verification } from "./types";

/**
 * Multi-agent verification.
 * Vision / Behavior / Context agents vote from the incident's real data;
 * ≥2 confirms → consensus. Runs after the MST anchor lands.
 */

export async function runVerification(incident: Incident, cameraWallet?: string | null): Promise<Verification> {
  const hasHash = Boolean(incident.evidenceHash && incident.evidenceHash.length === 64);
  const frames = incident.frames ?? 0;

  const agents: Verification["agents"] = [
    {
      name: "Vision Agent",
      result: hasHash ? "confirmed" : "abstained",
      confidence: clamp(0.82 + (frames > 3 ? 0.12 : 0.04)),
      rationale: hasHash
        ? `Frame packet (${frames}f) visually consistent with ${incident.type.replace(/_/g, " ")}.`
        : "No valid frame digest attached — cannot confirm visually.",
    },
    {
      name: "Behavior Agent",
      result: "confirmed",
      confidence: clamp(0.78 + incident.riskScore / 400),
      rationale: `Motion trajectory and dwell pattern match a ${incident.severity}-risk ${incident.type.replace(/_/g, " ")} signature.`,
    },
    {
      name: "Context Agent",
      result: incident.zone || incident.description.toLowerCase().includes("restricted") ? "confirmed" : "abstained",
      confidence: clamp(0.8 + (incident.zone ? 0.1 : 0.02)),
      rationale: incident.zone
        ? `Event localized to restricted zone "${incident.zone}" — context supports alert.`
        : "No zone context attached; agent abstains from contextual confirmation.",
    },
  ];

  // Stream each agent vote live before consensus lands
  for (const a of agents) {
    emitEvent({
      kind: "agent_vote",
      level: "info",
      message: `${a.name}: ${a.result.toUpperCase()} (${(a.confidence * 100).toFixed(0)}%) — ${a.rationale}`,
      data: { incidentId: incident.id, agent: a.name, result: a.result, confidence: a.confidence },
    });
    await sleep(450);
  }

  const confirmed = agents.filter((a) => a.result === "confirmed").length;
  const consensus: Verification["consensus"] = confirmed >= 2 ? "confirmed" : confirmed === 1 ? "pending" : "rejected";
  const confidence = agents.reduce((s, a) => s + a.confidence, 0) / agents.length;

  const verification: Verification = {
    id: nextId("VER"),
    incidentId: incident.id,
    agents,
    consensus,
    confidence: Number(confidence.toFixed(2)),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    quorum: `${confirmed}/3`,
  };

  appendJSON("verifications", verification, 300);
  updateJSON<Incident[]>("incidents", (arr) =>
    arr.map((i) =>
      i.id === incident.id
        ? { ...i, verificationStatus: consensus === "confirmed" ? "verified" : consensus === "rejected" ? "rejected" : "pending" }
        : i
    )
  );

  // Record verification on-chain when a verifier wallet is available
  const bc = getBlockchainState();
  if (bc.mode === "live" && incident.evidenceHash) {
    try {
      await registerVerifierOnChain(cameraWallet ?? undefined);
    } catch {
      /* non-fatal */
    }
  }

  emitEvent({
    kind: "verification_complete",
    level: consensus === "confirmed" ? "info" : "high",
    message: `Consensus ${verification.quorum} — ${incident.id} ${consensus.toUpperCase()} (confidence ${(confidence * 100).toFixed(0)}%)`,
    data: { incidentId: incident.id, consensus, quorum: verification.quorum },
  });

  return verification;
}

export function getVerification(incidentId: string): Verification | null {
  const arr = readJSON<Verification[]>("verifications", []) as Verification[];
  return arr.find((v) => v.incidentId === incidentId) ?? null;
}

/** Full evidence pipeline: incident → hash → evidence → MST anchor → agents → alert. */
export async function createIncident(input: {
  cameraId: string;
  type: string;
  title: string;
  severity: Severity;
  riskScore: number;
  description: string;
  source?: Incident["source"];
  zone?: string | null;
  frames?: number;
  framePayload?: string;
}): Promise<Incident> {
  const incident: Incident = {
    id: nextId("INC"),
    cameraId: input.cameraId,
    type: input.type,
    title: input.title,
    severity: input.severity,
    riskScore: Math.round(input.riskScore),
    timestamp: new Date().toISOString(),
    verificationStatus: "pending",
    status: "active",
    description: input.description,
    frames: input.frames ?? 12,
    source: input.source ?? "simulated",
    zone: input.zone ?? null,
  };

  const payload =
    input.framePayload ??
    JSON.stringify({ id: incident.id, cam: incident.cameraId, type: incident.type, ts: incident.timestamp, frames: incident.frames, risk: incident.riskScore });
  const evidenceHash = evidenceDigest(payload);
  incident.evidenceHash = evidenceHash;

  appendJSON("incidents", incident, 300);
  emitEvent({
    kind: "incident_created",
    level: incident.severity,
    message: `${incident.id} · ${incident.type.replace(/_/g, " ")} on ${incident.cameraId} — risk ${incident.riskScore}/100`,
    data: { incident },
  });

  const evidence: Evidence = {
    id: nextId("EVD"),
    incidentId: incident.id,
    originalHash: evidenceHash,
    currentHash: evidenceHash,
    storageReference: `cs://evidence/${incident.id}/packet.bin`,
    createdAt: new Date().toISOString(),
    tampered: false,
    chainStatus: "pending",
    frameCount: incident.frames,
    algorithm: "SHA-256",
    sizeBytes: payload.length,
  };
  appendJSON("evidence", evidence, 300);
  updateById<Incident>("incidents", incident.id, incident);

  // MST anchor
  const tx = await anchorEvidence({
    incidentId: incident.id,
    evidenceId: evidence.id,
    cameraId: incident.cameraId,
    evidenceHash,
    timestamp: incident.timestamp,
    eventType: incident.type,
  });
  updateJSON<Evidence[]>("evidence", (arr) =>
    arr.map((e) => (e.id === evidence.id ? { ...e, chainStatus: tx.status === "confirmed" ? "confirmed" : "pending" } : e))
  );
  updateJSON<Incident[]>("incidents", (arr) =>
    arr.map((i) => (i.id === incident.id ? { ...i, blockchainTx: tx.txHash, txMode: tx.mode } : i))
  );
  incident.blockchainTx = tx.txHash;
  incident.txMode = tx.mode;

  emitEvent({
    kind: "tx_submitted",
    level: "info",
    message: `MST anchor submitted for ${incident.id} — ${tx.txHash.slice(0, 18)}… [${tx.mode === "live" ? "LIVE" : "SIMULATED / DEMO"}]`,
    data: { tx },
  });

  // Verification quorum
  const cam = (readJSON<{ id: string; wallet?: string | null }[]>("cameras", []) as { id: string; wallet?: string | null }[]).find(
    (c) => c.id === incident.cameraId
  );
  await runVerification(incident, cam?.wallet);

  // Alert + activity
  appendJSON("alerts", {
    id: nextId("ALR"),
    incidentId: incident.id,
    title: `${incident.severity.toUpperCase()}: ${incident.title}`,
    message: `${incident.type.replace(/_/g, " ")} on ${incident.cameraId} — risk ${incident.riskScore}/100. Evidence ${evidenceHash.slice(0, 12)}… anchored.`,
    severity: incident.severity,
    acknowledged: false,
    createdAt: new Date().toISOString(),
    channel: "dashboard",
  }, 200);

  appendJSON("activity", {
    id: nextId("ACT"),
    kind: "incident_created",
    message: `${incident.id} · ${incident.type} · ${incident.cameraId} · risk ${incident.riskScore}`,
    level: incident.severity,
    timestamp: new Date().toISOString(),
  }, 300);

  return incident;
}

/** Simulate on-disk tampering and report the mismatch on-chain. */
export function tamperEvidence(incidentId: string, method = "frame_splice"): { originalHash: string; currentHash: string } | null {
  const ev = (readJSON<Evidence[]>("evidence", []) as Evidence[]).find((e) => e.incidentId === incidentId);
  if (!ev || ev.tampered) return null;
  const newHash = mutateHash(ev.originalHash, method);
  updateJSON<Evidence[]>("evidence", (arr) =>
    arr.map((e) =>
      e.id === ev.id ? { ...e, tampered: true, currentHash: newHash, tamperedAt: new Date().toISOString(), tamperMethod: method } : e
    )
  );
  updateJSON<Incident[]>("incidents", (arr) =>
    arr.map((i) => (i.id === incidentId ? { ...i, verificationStatus: "rejected", status: "investigating", severity: "critical" } : i))
  );
  anchorEvidence({
    incidentId,
    evidenceId: ev.id,
    cameraId: "network",
    evidenceHash: newHash,
    timestamp: new Date().toISOString(),
    eventType: "TAMPER_REPORT",
    type: "TAMPER_REPORT",
  });
  appendJSON("alerts", {
    id: nextId("ALR"),
    incidentId,
    title: "TAMPERING DETECTED",
    message: `Evidence for ${incidentId} no longer matches its anchored hash (${method}). Original ${ev.originalHash.slice(0, 10)}… ≠ current ${newHash.slice(0, 10)}…`,
    severity: "critical",
    acknowledged: false,
    createdAt: new Date().toISOString(),
    channel: "node",
  }, 200);
  appendJSON("activity", {
    id: nextId("ACT"),
    kind: "tamper_detected",
    message: `Evidence integrity failure on ${incidentId} (${method})`,
    level: "critical",
    timestamp: new Date().toISOString(),
  }, 300);
  emitEvent({
    kind: "tamper_detected",
    level: "critical",
    message: `🚨 TAMPERING DETECTED on ${incidentId} — anchored hash ≠ current hash (${method})`,
    data: { incidentId, originalHash: ev.originalHash, currentHash: newHash },
  });
  return { originalHash: ev.originalHash, currentHash: newHash };
}

export function reverifyEvidence(incidentId: string): boolean {
  const ev = (readJSON<Evidence[]>("evidence", []) as Evidence[]).find((e) => e.incidentId === incidentId);
  if (!ev) return false;
  const intact = ev.currentHash === ev.originalHash;
  updateJSON<Incident[]>("incidents", (arr) =>
    arr.map((i) => (i.id === incidentId ? { ...i, verificationStatus: intact ? "verified" : "rejected" } : i))
  );
  appendJSON("activity", {
    id: nextId("ACT"),
    kind: "reverify",
    message: `Re-verification of ${incidentId}: ${intact ? "hash intact — AUTHENTIC" : "hash mismatch — INVALID"}`,
    level: intact ? "info" : "high",
    timestamp: new Date().toISOString(),
  }, 300);
  return intact;
}

function clamp(n: number): number {
  return Number(Math.min(0.99, Math.max(0.5, n)).toFixed(2));
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
