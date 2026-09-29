import crypto from "crypto";

/** Real SHA-256 everywhere — demo mode simulates transport, never crypto. */

export function sha256(input: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function pseudoTxHash(seed: string): string {
  return "0x" + sha256(`mst-tx:${seed}:${Date.now()}:${Math.random()}`);
}

export function mutateHash(original: string, method: string): string {
  return sha256(`tampered:${method}:${original}`);
}

export function evidenceDigest(payload: crypto.BinaryLike): string {
  return sha256(payload);
}

export function nextId(prefix: string): string {
  return `${prefix}-${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 90) + 10)}`;
}

export function shortHash(hash: string, size = 10): string {
  if (!hash) return "";
  return `${hash.slice(0, size)}…${hash.slice(-4)}`;
}
