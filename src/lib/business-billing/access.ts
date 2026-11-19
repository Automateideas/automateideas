import { APIError } from "better-auth/api";

import { requireOrgRole } from "@/lib/access";
import { ORG_ROLES, hasBillingPermission, type BusinessBillingPermission } from "@/lib/roles";
import { assertFeature, assertWritable, getEntitlements } from "@/lib/subscription-billing/entitlements";
import { setAuditActor } from "@/lib/audit";

/** Permissions that only read. Everything else changes records. */
const READ_PERMISSIONS: readonly BusinessBillingPermission[] = ["billing.view", "billing.reports.view"];

/**
 * The signed-in member and their tenant (organization), or a 401/403 when:
 * - their role lacks `permission`;
 * - the workspace's plan doesn't include Business Billing;
 * - `permission` changes records and the workspace is read-only (subscription
 *   expired past its grace period). Reading always works, so data stays
 *   viewable and exportable.
 *
 * Every Business Billing API starts here, and the organization id it returns
 * is the only tenant id the services accept: never take one from the request.
 */
export async function requireBillingPermission(permission: BusinessBillingPermission) {
  const ctx = await requireOrgRole(ORG_ROLES);
  if (!hasBillingPermission(ctx.roles, permission)) {
    throw new APIError("FORBIDDEN", {
      code: "BILLING_PERMISSION_REQUIRED",
      message: "You don't have access to Billing. Ask an owner or admin.",
    });
  }

  const entitlements = await getEntitlements(ctx.organizationId);
  assertFeature(entitlements, "billing");
  if (!READ_PERMISSIONS.includes(permission)) {
    assertWritable(entitlements);
    // Successful changes in this request are written to the audit trail (lib/audit.ts).
    setAuditActor(ctx.organizationId, ctx.user.id);
  }

  return { ...ctx, entitlements };
}
