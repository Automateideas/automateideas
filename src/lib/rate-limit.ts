// A small fixed-window rate limiter kept in this server's memory.
// Good for one server (or a few: each counts on its own). For many servers,
// move the counters to Valkey/Redis (REDIS_URL).

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();
let lastSweep = 0;

/** Counts one hit for `key`; `ok: false` once `limit` hits happened within `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSeconds: number } {
  if (now - lastSweep > 60_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    lastSweep = now;
  }
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(key, w);
  }
  w.count++;
  return { ok: w.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
}

/** The caller's IP address as the proxy reports it (first X-Forwarded-For entry), else "unknown". */
export function clientIp(headers: Headers) {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}

export const SHARE_LIMIT_PER_MINUTE = 60;
