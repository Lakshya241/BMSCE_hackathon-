/**
 * Browser-side face pipeline for the Family Vault + privacy gate.
 *
 * DetectionLab sends raw face-crop pixels to the backend, which computes the
 * perceptual signature (5x5 luma grid + 24-bin hue histogram) and matches it
 * against enrolled family members. This module handles: getting pixel data
 * from the canvas, building face crops, and asking the backend to match.
 */

export interface FaceBox {
  x: number; // 0..1 normalized
  y: number;
  w: number;
  h: number;
}

export interface FaceMatchResult {
  family: boolean;
  threshold: number;
  best: { id: string; name: string; relation: string; similarity: number } | null;
  matches: { id: string; name: string; relation: string; similarity: number }[];
  vaultSize: number;
}

/** Pull [r,g,b,...] numbers for a normalized box out of a canvas. */
export function extractFaceRGB(canvas: HTMLCanvasElement, box: FaceBox, target = 32): { rgb: number[]; width: number; height: number } | null {
  const W = canvas.width, H = canvas.height;
  const sx = Math.max(0, Math.floor(box.x * W));
  const sy = Math.max(0, Math.floor(box.y * H));
  const sw = Math.max(1, Math.min(W - sx, Math.round(box.w * W)));
  const sh = Math.max(1, Math.min(H - sy, Math.round(box.h * H)));
  if (sw < 4 || sh < 4) return null;

  const tmp = document.createElement("canvas");
  tmp.width = target;
  tmp.height = target;
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, target, target);
  const data = ctx.getImageData(0, 0, target, target).data;
  const rgb: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    rgb.push(data[i], data[i + 1], data[i + 2]);
  }
  return { rgb, width: target, height: target };
}

/** Full JPEG data-URL of the current canvas frame (for vault enrollment thumbnails). */
export function canvasToDataURL(canvas: HTMLCanvasElement, quality = 0.7): string {
  try {
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return "";
  }
}

/** Crop a face box to its own JPEG data-URL (the vault stores this per member). */
export function cropToDataURL(canvas: HTMLCanvasElement, box: FaceBox, size = 96, quality = 0.72): string {
  const W = canvas.width, H = canvas.height;
  const sx = Math.max(0, Math.floor(box.x * W));
  const sy = Math.max(0, Math.floor(box.y * H));
  const sw = Math.max(1, Math.min(W - sx, Math.round(box.w * W)));
  const sh = Math.max(1, Math.min(H - sy, Math.round(box.h * H)));
  const tmp = document.createElement("canvas");
  tmp.width = size;
  tmp.height = size;
  const ctx = tmp.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, size, size);
  try {
    return tmp.toDataURL("image/jpeg", quality);
  } catch {
    return "";
  }
}

/** Ask the backend to match a face-crop against the family vault. */
export async function matchFaceOnBackend(face: { rgb: number[]; width: number; height: number }): Promise<FaceMatchResult | null> {
  try {
    const res = await fetch("/backend/api/family/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rgb: face.rgb, width: face.width, height: face.height }),
    });
    if (!res.ok) return null;
    return (await res.json()) as FaceMatchResult;
  } catch {
    return null;
  }
}
