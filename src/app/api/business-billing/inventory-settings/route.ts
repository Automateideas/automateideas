import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { inventorySettings, setInventorySettings } from "@/lib/business-billing/inventory/service";
import { invalid } from "@/lib/business-billing/records";
import { body, editAccess } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/inventory-settings (billing.view).
export const GET = route(async () => {
  const ctx = await requireBillingPermission("billing.view");
  return Response.json({ ...(await inventorySettings(ctx.organizationId)), ...editAccess(ctx, "billing.inventory.manage") });
});

// PUT { allowNegativeStock } (billing.inventory.manage): whether invoices, returns to suppliers
// and adjustments may take a warehouse below zero.
export const PUT = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.inventory.manage");
  const raw = await body(request);
  if (typeof raw.allowNegativeStock !== "boolean") invalid({ allowNegativeStock: "Send true or false." });
  return Response.json({ ...(await setInventorySettings(ctx.organizationId, ctx.user.id, { allowNegativeStock: raw.allowNegativeStock as boolean })), ...editAccess(ctx, "billing.inventory.manage") });
});
