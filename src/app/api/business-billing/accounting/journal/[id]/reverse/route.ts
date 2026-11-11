import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { reverseManualEntry } from "@/lib/business-billing/accounting/service";
import { isIsoDate } from "@/lib/business-billing/accounting/validation";
import { todayInIndia } from "@/lib/business-billing/documents/types";
import { FieldReader } from "@/lib/business-billing/fields";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";

// POST { date?, reason } (billing.accounting.manage): reverse a manual entry with its
// mirror image (posted entries are never edited). Returns the reversing entry.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/accounting/journal/[id]/reverse">) => {
  const { organizationId, user } = await requireBillingPermission("billing.accounting.manage");
  const raw = await body(request);
  const r = new FieldReader(raw);
  const reason = r.text("reason", 300, "Say why it's being reversed.");
  const date = raw.date === undefined || raw.date === null || raw.date === "" ? todayInIndia() : raw.date;
  if (!isIsoDate(date)) r.fail("date", "Enter a date as YYYY-MM-DD.");
  if (!r.ok) invalid(r.errors);
  return Response.json(await reverseManualEntry(organizationId, user.id, (await params).id, { date: date as string, reason: reason! }), { status: 201 });
});
