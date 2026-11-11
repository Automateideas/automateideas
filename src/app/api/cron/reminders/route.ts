import { timingSafeEqual } from "node:crypto";

import { runReminders } from "@/lib/business-billing/communication/service";

// GET or POST /api/cron/reminders, with "Authorization: Bearer <CRON_SECRET>".
//
// Sends every company's payment reminders that are due now, by each
// company's own schedule (Billing → Settings → Email & reminders). Call it
// every 15–60 minutes from any scheduler (Vercel Cron, a server crontab,
// cron-job.org). Safe to call more often or twice at once: each reminder is
// sent once. Without CRON_SECRET set, the endpoint is off (404).

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return null;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  const ok = authorized(request);
  if (ok === null) return new Response("Not found", { status: 404 });
  if (!ok) return Response.json({ error: { code: "UNAUTHORIZED", message: "Wrong or missing cron secret." } }, { status: 401 });
  const started = Date.now();
  const result = await runReminders();
  return Response.json({ ...result, ms: Date.now() - started });
}

export const GET = handle;
export const POST = handle;
