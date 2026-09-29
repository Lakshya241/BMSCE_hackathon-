import { sha256, nextId, shortHash } from "./crypto";
import { appendJSON, readJSON, updateJSON, deleteById, deleteJSON } from "./db";
import { emitEvent } from "./bus";
import { classifyFace, signatureFromRGB, type FaceMatch, type FaceSignature } from "./family";

/**
 * 10-second rolling capture booth — with THREE area modes.
 *
 *  family     : home/private. Video stored ONLY while a stranger is present
 *               AND no family member is in frame. Alert only under the same
 *               condition (a stranger alongside family = no alarm).
 *  restricted : vault/secure zone. EVERYTHING is recorded and alerts on any
 *               presence — motion, any face (family or stranger), trespassing.
 *  public     : lobby/street. NEVER alerts. Always recorded with SHA-256
 *               hash-chaining — if anyone edits the video, the chain breaks
 *               and the change is detected instantly.
 *
 * Every stored capture carries digest = SHA256(prevDigest + image) so the
 * whole booth is a tamper-evident hash chain.
 */

export type AreaMode = "family" | "restricted" | "public";

export interface CaptureFace {
  box: { x: number; y: number; w: number; h: number };
  family: boolean;
  match: FaceMatch | null;
}

export interface Capture {
  id: string;
  cameraId: string;
  mode: AreaMode;
  at: string;
  image: string; // small data-URL JPEG (photo strip)
  digest: string; // SHA-256 hash-chain digest (prevDigest + image)
  prevDigest: string | null; // previous capture in the chain (null = first)
  motion: boolean;
  persons: number;
  faces: CaptureFace[];
  strangers: number;
  familyCount: number;
  intrusion: boolean; // did this capture trip the mode's alert policy?
  storedReason: string; // why it was kept (or not)
  width: number;
  height: number;
  sizeBytes: number;
}

export interface CaptureStats {
  total: number;
  kept: number;
  skippedPrivate: number;
  intrusions: number;
  lastAt: string | null;
}

const CAP = 90; // rolling cap (~15 minutes of 10s captures)

export function captureStats(): CaptureStats {
  const fallback: CaptureStats = { total: 0, kept: 0, skippedPrivate: 0, intrusions: 0, lastAt: null };
  return readJSON<CaptureStats>("captureStats", fallback) as CaptureStats;
}

function bumpStats(kept: boolean, intrusion: boolean): void {
  updateJSON<CaptureStats>("captureStats", (s) => ({
    total: s.total + 1,
    kept: s.kept + (kept ? 1 : 0),
    skippedPrivate: s.skippedPrivate + (kept ? 0 : 1),
    intrusions: s.intrusions + (intrusion ? 1 : 0),
    lastAt: new Date().toISOString(),
  }));
}

/**
 * Ingest a 10s heartbeat capture with the given area mode.
 * Returns { stored, reason, intrusion, capture? }.
 */
export function ingestCapture(input: {
  cameraId: string;
  mode: AreaMode; // area this camera watches
  image: string; // data URL
  motion: boolean;
  persons: number;
  faces: { box: CaptureFace["box"]; rgb?: number[]; width?: number; height?: number; signature?: FaceSignature }[];
}): { stored: boolean; reason: string; intrusion: boolean; capture?: Capture } {
  const cam = String(input.cameraId || "CAM-LAB").slice(0, 24);
  const mode: AreaMode = ["family", "restricted", "public"].includes(input.mode) ? input.mode : "family";

  // Validate + measure the image. Refuse huge payloads.
  const sizeBytes = Math.round((input.image.length * 3) / 4);
  if (!input.image.startsWith("data:image/") || sizeBytes > 400_000) {
    bumpStats(false, false);
    return { stored: false, reason: "invalid_image", intrusion: false };
  }

  // ---- Classify every face against the family vault ----
  const classified: CaptureFace[] = [];
  let strangers = 0;
  let familyCount = 0;
  for (const f of input.faces ?? []) {
    let sig: FaceSignature | null = f.signature ?? null;
    if (!sig && f.rgb && f.rgb.length && f.width && f.height) {
      sig = signatureFromRGB(f.rgb, f.width, f.height); // client sent raw pixels
    }
    if (!sig) {
      classified.push({ box: f.box, family: false, match: null }); // unidentifiable → stranger (fail-closed)
      strangers++;
      continue;
    }
    const { family, best } = classifyFace(sig);
    classified.push({ box: f.box, family, match: family ? best : null });
    if (family) familyCount++;
    else strangers++;
  }

  const strangersPresent = strangers > 0;
  let stored: boolean;
  let reason: string;
  let intrusion = false;

  // 20s intrusion cooldown: after an intrusion alarm, no NEW intrusion is
  // raised for 20 seconds (captures may still be stored per mode rules).
  const INTRUSION_COOLDOWN_MS = 20_000;

  if (mode === "family") {
    // Family rule: store + alert ONLY when a stranger is present WITHOUT family.
    if (strangersPresent && familyCount > 0) {
      stored = false;
      reason = `stranger WITH family (${familyCount}) — no alert, no recording (family mode)`;
    } else if (strangersPresent) {
      stored = true;
      intrusion = true;
      reason = "stranger alone — intrusion alert + recording (family mode)";
    } else {
      stored = false;
      reason = input.faces?.length ? "family only — suppressed (family mode)" : "no faces — idle (family mode)";
    }
  } else if (mode === "restricted") {
    // Restricted rule: record everything; alert on any presence.
    stored = true;
    intrusion = strangersPresent || familyCount > 0 || input.motion || input.persons > 0;
    reason = intrusion
      ? `presence detected (${strangers} stranger / ${familyCount} family / motion=${input.motion}) — restricted alarm`
      : "empty frame — recorded (restricted mode)";
  } else {
    // Public rule: NEVER alert; always record for the tamper-evident hash chain.
    stored = true;
    intrusion = false;
    reason = "public area — recorded for hash chain, no alerts (public mode)";
  }

  // ---- Apply the 20s intrusion cooldown ----
  if (intrusion) {
    const caps = readJSON<Capture[]>("captures", []) as Capture[];
    const lastIntr = caps.find((c) => c.intrusion);
    if (lastIntr) {
      const since = Date.now() - new Date(lastIntr.at).getTime();
      if (since < INTRUSION_COOLDOWN_MS) {
        intrusion = false;
        reason += ` — intrusion cooldown active (${Math.ceil((INTRUSION_COOLDOWN_MS - since) / 1000)}s left), no repeat alarm`;
      }
    }
  }

  if (!stored) {
    bumpStats(false, false);
    emitEvent({
      kind: "capture_skipped",
      level: "info",
      message: `🔒 ${cam} [${mode}] frame NOT stored — ${reason}`,
      data: { cameraId: cam, mode, reason: "policy_suppressed" },
    });
    return { stored: false, reason, intrusion: false };
  }

  // ---- Hash chain: digest = SHA256(prevDigest + image) ----
  const prev = (readJSON<Capture[]>("captures", []) as Capture[])[0]; // newest first
  const prevDigest = prev?.digest ?? null;
  const digest = sha256(`${prevDigest ?? "GENESIS"}|${input.image}`);

  const capture: Capture = {
    id: nextId("CAP"),
    cameraId: cam,
    mode,
    at: new Date().toISOString(),
    image: input.image,
    digest,
    prevDigest,
    motion: Boolean(input.motion),
    persons: Math.max(0, Math.round(input.persons || 0)),
    faces: classified,
    strangers,
    familyCount,
    intrusion,
    storedReason: reason,
    width: 0,
    height: 0,
    sizeBytes,
  };

  appendJSON<Capture>("captures", capture, CAP);
  bumpStats(true, intrusion);

  emitEvent({
    kind: "capture_stored",
    level: intrusion ? "high" : "info",
    message: intrusion
      ? `🚨 ${cam} [${mode.toUpperCase()}] INTRUSION — ${reason} · chain ${shortHash(digest, 8)}`
      : `📹 ${cam} [${mode}] stored — ${reason} · chain ${shortHash(digest, 8)}`,
    data: { captureId: capture.id, cameraId: cam, mode, strangers, familyCount, digest, intrusion },
  });
  return { stored: true, reason, intrusion, capture };
}

/** Verify the integrity of the hash chain (newest → oldest). Returns first broken link. */
export function verifyCaptureChain(): {
  intact: boolean;
  checked: number;
  brokenAt: string | null; // capture id where the chain breaks
  reason: string | null;
} {
  const caps = readJSON<Capture[]>("captures", []) as Capture[];
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i];
    const expectedPrev = i + 1 < caps.length ? caps[i + 1].digest : null;
    const expectedDigest = sha256(`${expectedPrev ?? "GENESIS"}|${c.image}`);
    if (c.digest !== expectedDigest) {
      return {
        intact: false,
        checked: caps.length,
        brokenAt: c.id,
        reason: i + 1 < caps.length
          ? `digest mismatch vs previous capture ${caps[i + 1].id} — image was modified after storage`
          : "digest mismatch vs GENESIS — first capture was modified",
      };
    }
  }
  return { intact: true, checked: caps.length, brokenAt: null, reason: null };
}

export function listCaptures(limit = 30): Capture[] {
  return (readJSON<Capture[]>("captures", []) as Capture[]).slice(0, limit);
}

export function getCapture(id: string): Capture | null {
  return (readJSON<Capture[]>("captures", []) as Capture[]).find((c) => c.id === id) ?? null;
}

export function removeCapture(id: string): boolean {
  const ok = deleteById<Capture>("captures", id);
  if (ok) emitEvent({ kind: "capture_deleted", level: "info", message: `Capture ${id} deleted` });
  return ok;
}

export function clearCaptures(): number {
  const n = (readJSON<Capture[]>("captures", []) as Capture[]).length;
  deleteJSON("captures");
  emitEvent({ kind: "capture_deleted", level: "info", message: `All captures cleared (${n})` });
  return n;
}
