import { graphBase, graphVersion } from "./config";

// A small client for Meta's Graph API (WhatsApp Cloud API). Errors keep
// Meta's message and code so they can be shown and logged.

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
  ) {
    super(message);
  }
}

export async function graph<T = Record<string, unknown>>(path: string, opts: { method?: "GET" | "POST" | "DELETE"; token?: string; query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const url = new URL(`${graphBase()}/${graphVersion()}/${path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_user_msg?: string } } & T;
  if (!res.ok || data.error) {
    const e = data.error;
    throw new GraphError(e?.error_user_msg || e?.message || `Meta returned HTTP ${res.status}`, res.status, e?.code ?? null);
  }
  return data;
}
