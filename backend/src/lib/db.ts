import fs from "fs";
import path from "path";

/** JSON-file persistence layer — single source of truth for storage. */

const DATA_DIR = path.join(process.cwd(), "data");

function filePath(name: string): string {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const safe = path.basename(name).replace(/\.json$/i, "");
  return path.join(DATA_DIR, `${safe}.json`);
}

export function readJSON<T>(name: string, fallback: T | [] = []): T | [] {
  try {
    const fp = filePath(name);
    if (!fs.existsSync(fp)) return fallback;
    const raw = fs.readFileSync(fp, "utf-8").trim();
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(name: string, data: T): T {
  filePath("_");
  const fp = filePath(name);
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, fp);
  return data;
}

export function updateJSON<T>(name: string, updater: (data: T) => T, fallback: T | [] = []): T {
  const data = readJSON<T>(name, fallback) as T;
  return writeJSON(name, updater(data));
}

export function appendJSON<T>(name: string, item: T | T[], cap = 500): T[] {
  const items = Array.isArray(item) ? item : [item];
  return updateJSON<T[]>(name, (arr) => [...items, ...arr].slice(0, cap), []);
}

export function deleteJSON(name: string): boolean {
  const fp = filePath(name);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
    return true;
  }
  return false;
}

export function findById<T extends { id: string }>(name: string, id: string): T | null {
  const arr = readJSON<T[]>(name, []) as T[];
  return arr.find((x) => x.id === id) ?? null;
}

export function updateById<T extends { id: string }>(name: string, id: string, patch: Partial<T>): T | null {
  let updated: T | null = null;
  updateJSON<T[]>(name, (arr) =>
    arr.map((x) => {
      if (x.id !== id) return x;
      updated = { ...x, ...patch };
      return updated;
    })
  , []);
  return updated;
}

export function deleteById<T extends { id: string }>(name: string, id: string): boolean {
  let removed = false;
  updateJSON<T[]>(name, (arr) => arr.filter((x) => {
    if (x.id === id) removed = true;
    return x.id !== id;
  }), []);
  return removed;
}
