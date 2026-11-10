import { APIError } from "better-auth/api";

import { readJson, route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { getBillingSettings, saveBillingSettings } from "@/lib/business-billing/settings";
import { validateBillingSettings } from "@/lib/business-billing/settings-validation";
import { hasBillingPermission } from "@/lib/roles";

// GET /api/business-billing/settings: company billing details (billing.view).
export const GET = route(async () => {
  const { organizationId, roles, entitlements } = await requireBillingPermission("billing.view");
  const settings = await getBillingSettings(organizationId);
  const readOnly = entitlements.access.state === "read_only";
  return Response.json({
    ...settings,
    canEdit: hasBillingPermission(roles, "billing.settings.manage") && !readOnly,
    // Why editing is off when the workspace is read-only (subscription expired).
    readOnlyReason: readOnly ? entitlements.access.reason : null,
  });
});

// PUT /api/business-billing/settings: save them (billing.settings.manage).
// Field problems come back as 400 with `error.fields`.
export const PUT = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.settings.manage");
  const body = await readJson<Record<string, unknown>>(request);

  const result = validateBillingSettings(body);
  if (!result.ok) {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_SETTINGS",
      message: "Check the highlighted fields.",
      fields: result.errors,
    });
  }

  const saved = await saveBillingSettings(organizationId, user.id, result.values);
  return Response.json({ ...saved, canEdit: true });
});
