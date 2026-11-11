import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Organization roles. Shared by the server (lib/auth.ts, lib/access.ts) and
 * the browser (lib/auth-client.ts, Team page), so both agree on the rules.
 *
 * - owner:   created the org. Everything, including the subscription.
 * - admin:   everything the owner can, except it can't remove the owner.
 * - manager: Team page only, and only for members (invite, cancel, remove).
 * - member:  shown as "Employee". No team management, no subscription.
 */
export const ORG_ROLES = ["owner", "admin", "manager", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Roles an invite can grant. "owner" only comes from creating the org. */
export const INVITABLE_ROLES = ["admin", "manager", "member"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const TEAM_MANAGER_ROLES: readonly OrgRole[] = ["owner", "admin", "manager"];
/** Who may view and change the SaaS subscription (/subscription, /api/subscription/*). */
export const SUBSCRIPTION_ROLES: readonly OrgRole[] = ["owner", "admin"];
/** @deprecated Old name for SUBSCRIPTION_ROLES, kept so existing imports keep working. */
export const BILLING_ROLES = SUBSCRIPTION_ROLES;

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Employee",
};

export const parseRoles = (role: string) => role.split(",").map((r) => r.trim());

/** Display label for a stored role string such as "admin" or "admin,member". */
export function roleLabel(role: string) {
  const first = parseRoles(role)[0] as OrgRole;
  return ROLE_LABELS[first] ?? role;
}

/**
 * Which roles someone with `actorRoles` may invite, or remove/cancel.
 * Owners and admins handle admin, manager and member; managers only member.
 */
export function assignableRoles(actorRoles: readonly string[]): InvitableRole[] {
  if (actorRoles.includes("owner") || actorRoles.includes("admin")) return [...INVITABLE_ROLES];
  if (actorRoles.includes("manager")) return ["member"];
  return [];
}

/** Whether the actor may act on (invite, cancel, remove) someone with `targetRole`. */
export function canManageRole(actorRoles: readonly string[], targetRole: string) {
  const allowed = assignableRoles(actorRoles) as string[];
  const target = parseRoles(targetRole);
  return target.length > 0 && target.every((r) => allowed.includes(r));
}

// Better Auth access control: the plugin checks these on invite/cancel/remove.
export const ac = createAccessControl(defaultStatements);

export const orgRoles = {
  owner: ownerAc,
  admin: adminAc,
  manager: ac.newRole({
    invitation: ["create", "cancel"],
    member: ["delete"],
  }),
  member: memberAc,
};

/* ---------------- Business Billing (/billing) ----------------
 * Separate from the SaaS subscription above: these govern the tenant's own
 * customer billing (invoices, customers, payments...). */

export const BUSINESS_BILLING_PERMISSIONS = [
  "billing.view", // open /billing and read its pages
  "billing.settings.manage", // company details, tax and invoice defaults
  "billing.invoices.manage",
  "billing.quotations.manage",
  "billing.customers.manage",
  "billing.catalog.manage", // products and services
  "billing.payments.manage",
  "billing.purchases.manage",
  "billing.reports.view",
  "billing.accounting.manage", // chart of accounts, manual journal entries, closing the books
] as const;
export type BusinessBillingPermission = (typeof BUSINESS_BILLING_PERMISSIONS)[number];

/** Which permissions each role has. Owners and admins: everything; others: none yet. */
export const BUSINESS_BILLING_ROLE_PERMISSIONS: Record<OrgRole, readonly BusinessBillingPermission[]> = {
  owner: BUSINESS_BILLING_PERMISSIONS,
  admin: BUSINESS_BILLING_PERMISSIONS,
  manager: [],
  member: [],
};

export function hasBillingPermission(actorRoles: readonly string[], permission: BusinessBillingPermission) {
  return actorRoles.some((r) =>
    (BUSINESS_BILLING_ROLE_PERMISSIONS[r as OrgRole] ?? []).includes(permission),
  );
}
