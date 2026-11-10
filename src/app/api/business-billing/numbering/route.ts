import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { NUMBERED_DOCUMENTS, type NumberedDocument } from "@/lib/business-billing/numbering-format";
import { previewNextNumbers, setNextNumber } from "@/lib/business-billing/numbering";
import { invalid } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";
import { saveNumbering } from "@/lib/business-billing/tax-settings";
import { validateNumbering } from "@/lib/business-billing/tax-settings-validation";

// GET /api/business-billing/numbering (billing.view): formats and the next number of each document type.
export const GET = route(async () => {
  const ctx = await requireBillingPermission("billing.view");
  return Response.json({ ...(await previewNextNumbers(ctx.organizationId)), ...editAccess(ctx, "billing.settings.manage") });
});

// PUT (billing.settings.manage): { formats: { invoice: { prefix, includeFinancialYear, padding }, … } }.
export const PUT = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.settings.manage");
  const raw = await body(request);
  await saveNumbering(organizationId, user.id, valuesOrThrow(validateNumbering(raw.formats)));
  return Response.json(await previewNextNumbers(organizationId));
});

// POST (billing.settings.manage): { documentType, nextNumber } — continue from another system's numbers.
// Only moves forward, so no number is ever issued twice.
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.settings.manage");
  const raw = await body(request);
  const type = NUMBERED_DOCUMENTS.find((d) => d.type === raw.documentType)?.type as NumberedDocument | undefined;
  const n = raw.nextNumber;
  if (!type) invalid({ documentType: "Choose a document type." });
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 99_999_999) invalid({ nextNumber: "Enter a whole number from 1 to 99999999." });
  await setNextNumber(organizationId, user.id, type, n as number);
  return Response.json(await previewNextNumbers(organizationId));
});
