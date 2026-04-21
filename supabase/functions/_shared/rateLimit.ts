// @ts-nocheck
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;
const ipHits = new Map<string, number[]>();

export function allowIp(ip: string): boolean {
  const now = Date.now();
  const current = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (current.length >= RATE_LIMIT) return false;
  current.push(now);
  ipHits.set(ip, current);
  return true;
}
