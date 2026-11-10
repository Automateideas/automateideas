import { describe, expect, it } from "vitest";

import * as roles from "./roles";

describe("subscription permissions", () => {
  it("lets only owners and admins manage the subscription", () => {
    expect([...roles.SUBSCRIPTION_ROLES].sort()).toEqual(["admin", "owner"]);
  });

  it("keeps BILLING_ROLES as the same list for existing imports", () => {
    expect(roles.BILLING_ROLES).toBe(roles.SUBSCRIPTION_ROLES);
  });
});

describe("business billing permissions", () => {
  it("gives owners and admins every billing permission", () => {
    for (const p of roles.BUSINESS_BILLING_PERMISSIONS) {
      expect(roles.hasBillingPermission(["owner"], p)).toBe(true);
      expect(roles.hasBillingPermission(["admin"], p)).toBe(true);
    }
  });

  it("gives managers and employees none", () => {
    for (const p of roles.BUSINESS_BILLING_PERMISSIONS) {
      expect(roles.hasBillingPermission(["manager"], p)).toBe(false);
      expect(roles.hasBillingPermission(["member"], p)).toBe(false);
    }
  });

  it("ignores unknown roles", () => {
    expect(roles.hasBillingPermission(["accountant"], "billing.view")).toBe(false);
    expect(roles.hasBillingPermission([], "billing.view")).toBe(false);
  });

  it("is a separate permission set from the subscription", () => {
    expect(roles.BUSINESS_BILLING_PERMISSIONS.every((p) => p.startsWith("billing."))).toBe(true);
  });
});

describe("team permissions", () => {
  it("lets owners, admins and managers manage the team", () => {
    expect([...roles.TEAM_MANAGER_ROLES].sort()).toEqual(["admin", "manager", "owner"]);
  });

  it("limits managers to employees", () => {
    expect(roles.canManageRole(["manager"], "member")).toBe(true);
    expect(roles.canManageRole(["manager"], "admin")).toBe(false);
    expect(roles.canManageRole(["admin"], "manager")).toBe(true);
    expect(roles.canManageRole(["member"], "member")).toBe(false);
    expect(roles.canManageRole(["admin"], "owner")).toBe(false);
  });
});
