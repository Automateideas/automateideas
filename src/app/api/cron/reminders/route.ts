import { runReminders } from "@/lib/business-billing/communication/service";
import { cronJob } from "@/lib/cron";

// GET or POST /api/cron/reminders, with "Authorization: Bearer <CRON_SECRET>".
//
// Sends every company's payment reminders that are due now, by each
// company's own schedule. /api/cron/billing does this too (after recurring
// invoices); use that one for a single scheduled job. Safe to call often or
// twice at once: each reminder is sent once. Without CRON_SECRET the
// endpoint is off (404).

const handle = (request: Request) => cronJob(request, async () => ({ ...(await runReminders()) }));

export const GET = handle;
export const POST = handle;
