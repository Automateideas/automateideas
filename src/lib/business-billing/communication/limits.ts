import { and, count, eq, gte, ne } from "drizzle-orm";

import { billingMessages } from "@/db/schema";

import { conflict } from "../records";
import { withTenant } from "../tenant-db";

// A ceiling on how many emails and WhatsApp messages one company sends per
// hour (manual and scheduled together). It stops a mistake, a runaway
// script or a compromised account from spamming customers or running up
// WhatsApp costs. Counted in the database, so it holds across servers.

export const messagesPerHour = () => {
  const n = Number(process.env.BILLING_MESSAGES_PER_HOUR);
  return Number.isInteger(n) && n > 0 ? n : 300;
};

/** 409 SEND_LIMIT once the company has sent the hourly maximum. */
export async function assertSendRate(organizationId: string, now = new Date()) {
  const since = new Date(now.getTime() - 3_600_000);
  const [{ n }] = await withTenant(organizationId, (tx) =>
    tx
      .select({ n: count() })
      .from(billingMessages)
      .where(and(eq(billingMessages.organizationId, organizationId), gte(billingMessages.createdAt, since), ne(billingMessages.status, "failed"))),
  );
  if (n >= messagesPerHour()) {
    conflict("SEND_LIMIT", `You've sent ${messagesPerHour()} messages in the last hour, the limit. Try again a little later.`);
  }
}
