import { runReminders } from "@/lib/business-billing/communication/service";
import { runRecurring } from "@/lib/business-billing/recurring/service";
import { cronJob } from "@/lib/cron";

// GET or POST /api/cron/billing, with "Authorization: Bearer <CRON_SECRET>".
//
// The one scheduled job for Business Billing: creates (and issues, and
// emails) recurring invoices that are due, then sends payment reminders.
// Call it every 15–60 minutes from any scheduler (Vercel Cron, a server
// crontab, cron-job.org). Safe to call more often or twice at once. Without
// CRON_SECRET the endpoint is off (404).

const handle = (request: Request) =>
  cronJob(request, async () => {
    const recurring = await runRecurring();
    const reminders = await runReminders();
    return { recurring, reminders };
  });

export const GET = handle;
export const POST = handle;
