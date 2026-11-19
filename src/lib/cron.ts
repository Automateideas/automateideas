import { timingSafeEqual } from "node:crypto";

/**
 * Checks "Authorization: Bearer <CRON_SECRET>" on a scheduled-job request.
 * null when CRON_SECRET isn't set (or is too short): the job endpoints are then off (404).
 */
export function cronAuthorized(request: Request): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return null;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Runs a job behind the cron secret and returns its result as JSON. */
export async function cronJob(request: Request, job: () => Promise<Record<string, unknown>>) {
  const ok = cronAuthorized(request);
  if (ok === null) return new Response("Not found", { status: 404 });
  if (!ok) return Response.json({ error: { code: "UNAUTHORIZED", message: "Wrong or missing cron secret." } }, { status: 401 });
  const started = Date.now();
  const result = await job();
  return Response.json({ ...result, ms: Date.now() - started });
}
