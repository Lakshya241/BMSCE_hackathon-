export function shortHash(hash: string, size = 10): string {
  if (!hash) return "";
  return `${hash.slice(0, size)}…${hash.slice(-4)}`;
}
