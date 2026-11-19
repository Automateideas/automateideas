import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { listAuditLogs } from "@/lib/business-billing/audit-log";
import { parseListQuery } from "@/lib/business-billing/records";
import { APIError } from "better-auth/api";
import { hasBillingPermission } from "@/lib/roles";

// GET /api/business-billing/audit-logs?entityType=&entityId=&page= (owners and admins:
// billing.settings.manage, read even when the workspace is read-only): every change made
// in Business Billing, who made it, when and from where. Newest first.
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  if (!hasBillingPermission(ctx.roles, "billing.settings.manage")) {
    throw new APIError("FORBIDDEN", { code: "BILLING_PERMISSION_REQUIRED", message: "Only owners and admins can see the activity log." });
  }
  const p = new URL(request.url).searchParams;
  const { page, pageSize } = parseListQuery(request.url);
  return Response.json(await listAuditLogs(ctx.organizationId, { page, pageSize, entityType: p.get("entityType") || null, entityId: p.get("entityId") || null }));
});
