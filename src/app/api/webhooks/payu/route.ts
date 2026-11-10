import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { paymentFromPayu, recordPayment } from "@/lib/subscription-billing/payments";
import { SEAT_CHECKOUT_TAG, verifyPayuHash } from "@/lib/subscription-billing/payu";
import { MAX_SEATS } from "@/lib/subscription-billing/plan";
import { DEFAULT_PLAN, isBillingCycle, isPlanId, periodEnd } from "@/lib/subscription-billing/plans";

// POST /api/webhooks/payu: where a paid subscription change takes effect
// (seat_limit, plan_id, billing_cycle, plan_status, current_period_end,
// subscription_id) and where subscription payments are recorded.
// Configure this URL as the payment webhook in PayU.
export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    const type = request.headers.get("content-type") ?? "";
    const raw = type.includes("application/json")
      ? ((await request.json()) as Record<string, unknown>)
      : Object.fromEntries((await request.formData()).entries());
    params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? "")]));
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  let valid: boolean;
  try {
    valid = verifyPayuHash(params);
  } catch (error) {
    console.error("PayU webhook: PAYU_KEY/PAYU_SALT missing", error);
    return new Response("PayU is not configured", { status: 500 });
  }
  if (!valid) return new Response("Invalid hash", { status: 401 });

  // Only seat checkouts from /api/subscription/seats carry these fields.
  if (params.udf3 !== SEAT_CHECKOUT_TAG) return new Response("Ignored", { status: 200 });

  const organizationId = params.udf1;
  const seats = Number(params.udf2);
  if (!organizationId || !Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
    return new Response("Missing org or seats", { status: 400 });
  }

  const [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (!org) {
    return params.status === "success"
      ? new Response("Unknown organization", { status: 404 })
      : new Response("OK", { status: 200 });
  }

  // Checkouts from before plans existed carry no plan or cycle: Starter, monthly.
  const planId = isPlanId(params.udf4) ? params.udf4 : DEFAULT_PLAN;
  const billingCycle = isBillingCycle(params.udf5) ? params.udf5 : "monthly";
  const payment = paymentFromPayu(params, organizationId, seats);

  await db.transaction(async (tx) => {
    // Every attempt (success or not) is kept for /subscription/payments.
    if (payment) await recordPayment(payment, tx);

    // A failed seat change leaves the current plan as it was, so only success
    // changes anything. Retried webhooks write the same values again.
    if (params.status === "success") {
      await tx
        .update(organization)
        .set({
          seatLimit: seats,
          planId,
          billingCycle,
          planStatus: "active",
          subscriptionId: params.mihpayid || null,
          // A paid change starts a new period from today.
          currentPeriodEnd: periodEnd(billingCycle),
          cancelAtPeriodEnd: false,
        })
        .where(eq(organization.id, organizationId));
    }
  });

  return new Response("OK", { status: 200 });
}
