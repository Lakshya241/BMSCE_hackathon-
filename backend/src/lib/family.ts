import { sha256, nextId } from "./crypto";
import { readJSON, writeJSON, updateJSON, deleteById } from "./db";
import { emitEvent } from "./bus";

/**
 * Family Face Vault.
 *
 * Faces are represented by a lightweight perceptual signature:
 *   - 5x5 luminance grid (structure of the face, grayscale, resolution-independent)
 *   - 24-bin hue histogram (skin/hair tone)
 * Signatures are stored as JSON (fits the project's JSON-store philosophy) and
 * matched with real cosine-similarity + intersection math — no external AI service.
 *
 * Used by the privacy gate: video is only retained when at least one detected
 * face does NOT match any family member (i.e. a stranger/non-family person).
 */

export interface FaceEntry {
  id: string;
  name: string;
  relation: string;
  signature: FaceSignature;
  photo: string; // data URL (small thumbnail)
  photoHash: string; // SHA-256 of the original upload bytes
  createdAt: string;
}

export interface FaceSignature {
  grid: number[]; // 25 luma values 0..1
  hue: number[]; // 24 hue bins (normalized)
}

export interface FaceMatch {
  id: string;
  name: string;
  relation: string;
  similarity: number; // 0..1
}

/**
 * Signature builder: caller sends a compact numeric array [r,g,b, r,g,b, ...]
 * for a WxH face crop (row-major). We downsample to a 5x5 luma grid + 24-bin
 * hue histogram server-side — small enough for JSON, stable enough to match.
 */
export function signatureFromRGB(nums: number[], width: number, height: number): FaceSignature {
  const GRID = 5, HUEBINS = 24;
  const grid = new Array(GRID * GRID).fill(0);
  const gridN = new Array(GRID * GRID).fill(0);
  const hue = new Array(HUEBINS).fill(0);
  let hueTotal = 0;

  const px = Math.max(1, Math.floor(nums.length / 3 / Math.max(1, height)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < px && (y * px + x) * 3 + 2 < nums.length; x++) {
      const r = nums[(y * px + x) * 3];
      const g = nums[(y * px + x) * 3 + 1];
      const b = nums[(y * px + x) * 3 + 2];
      // 5x5 luma grid
      const gx = Math.min(GRID - 1, Math.floor((x / px) * GRID));
      const gy = Math.min(GRID - 1, Math.floor((y / height) * GRID));
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      grid[gy * GRID + gx] += lum;
      gridN[gy * GRID + gx]++;
      // hue histogram (skip near-grayscale pixels)
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 30 && mx - mn > 18) {
        let h: number;
        if (mx === r) h = ((g - b) / (mx - mn)) % 6;
        else if (mx === g) h = (b - r) / (mx - mn) + 2;
        else h = (r - g) / (mx - mn) + 4;
        h = Math.round(((h * 60 + 360) % 360) / 15) % HUEBINS;
        hue[h]++;
        hueTotal++;
      }
    }
  }
  const gridNorm = grid.map((v, i) => Number((v / Math.max(1, gridN[i])).toFixed(4)));
  const hueNorm = hue.map((v) => Number((v / Math.max(1, hueTotal)).toFixed(4)));
  return { grid: gridNorm, hue: hueNorm };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.max(1e-9, Math.sqrt(na) * Math.sqrt(nb));
}

function histIntersection(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += Math.min(a[i], b[i]);
  return Math.min(1, s);
}

/** Match a signature against the vault. Returns sorted matches above 0. */
export function matchFace(sig: FaceSignature): FaceMatch[] {
  const faces = readJSON<FaceEntry[]>("family", []) as FaceEntry[];
  const out: FaceMatch[] = [];
  for (const f of faces) {
    const sGrid = cosine(sig.grid, f.signature.grid); // 0..1 (luma structure)
    const sHue = histIntersection(sig.hue, f.signature.hue); // 0..1 (tone)
    const similarity = Number((0.72 * sGrid + 0.28 * sHue).toFixed(4));
    if (similarity > 0.2) out.push({ id: f.id, name: f.name, relation: f.relation, similarity });
  }
  return out.sort((a, b) => b.similarity - a.similarity);
}

/** Privacy gate: is this face family? MATCH_THRESHOLD tuned for the signature space. */
export const MATCH_THRESHOLD = 0.82;

export function classifyFace(sig: FaceSignature): { family: boolean; best: FaceMatch | null } {
  const matches = matchFace(sig);
  const best = matches[0] ?? null;
  return { family: Boolean(best && best.similarity >= MATCH_THRESHOLD), best };
}

export function listFamily(): FaceEntry[] {
  return (readJSON<FaceEntry[]>("family", []) as FaceEntry[]).map(({ signature, ...rest }) => ({
    ...rest,
    signature: { grid: signature.grid, hue: signature.hue }, // keep shape, client never needs it
  })) as FaceEntry[];
}

export function addFamilyMember(input: {
  name: string; relation: string; signature: FaceSignature; photo: string; photoRaw?: string;
}): FaceEntry {
  const entry: FaceEntry = {
    id: nextId("FAM"),
    name: String(input.name).slice(0, 60),
    relation: String(input.relation).slice(0, 30),
    signature: input.signature,
    photo: input.photo,
    photoHash: sha256(input.photoRaw ?? input.photo),
    createdAt: new Date().toISOString(),
  };
  updateJSON<FaceEntry[]>("family", (arr) => [entry, ...arr].slice(0, 30));
  emitEvent({
    kind: "family_update",
    level: "info",
    message: `Family member enrolled: ${entry.name} (${entry.relation}) — face signature stored`,
    data: { id: entry.id, name: entry.name },
  });
  return entry;
}

export function removeFamilyMember(id: string): boolean {
  const ok = deleteById<FaceEntry>("family", id);
  if (ok) emitEvent({ kind: "family_update", level: "info", message: `Family member removed (${id})` });
  return ok;
}

export function familyCount(): number {
  return (readJSON<FaceEntry[]>("family", []) as FaceEntry[]).length;
}
