import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BILLING_NAV, BILLING_SECTIONS } from "./_components/sections";

const billingDir = __dirname;
const REQUIRED = ["", "invoices", "quotations", "customers", "suppliers", "products", "services", "payments", "purchases", "reports", "settings"];

describe("business billing routes", () => {
  it.each(REQUIRED)("/billing/%s has a page", (segment) => {
    expect(existsSync(path.join(billingDir, segment, "page.tsx"))).toBe(true);
  });

  it("has a tab for every required route, in order, and nothing else", () => {
    expect(BILLING_NAV.map((l) => l.href)).toEqual(REQUIRED.map((s) => (s ? `/billing/${s}` : "/billing")));
  });

  it("gives every section an empty state", () => {
    for (const s of BILLING_SECTIONS) {
      expect(s.empty.title.length).toBeGreaterThan(0);
      expect(s.empty.description.length).toBeGreaterThan(0);
    }
  });

  it("guards the whole module in its layout", () => {
    const layout = readFileSync(path.join(billingDir, "layout.tsx"), "utf8");
    expect(layout).toContain("canUseBilling");
    expect(layout).toContain('redirect("/dashboard")');
  });

  it("is protected by the login proxy", () => {
    const proxy = readFileSync(path.resolve(billingDir, "../../../proxy.ts"), "utf8");
    expect(proxy).toContain('"/billing/:path*"');
  });

  it("calls only Business Billing APIs, never the subscription ones", () => {
    const dir = path.join(billingDir, "_components");
    for (const file of ["overview-view.tsx", "settings-form.tsx"]) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).toContain("/api/business-billing/");
      expect(src).not.toMatch(/\/api\/billing\b/);
      expect(src).not.toMatch(/\/api\/subscription\b/);
    }
  });

  it("has the tax and numbering settings pages and APIs", () => {
    for (const seg of ["settings/tax", "settings/invoices"]) {
      expect(existsSync(path.join(billingDir, seg, "page.tsx")), seg).toBe(true);
    }
    const api = path.resolve(billingDir, "../../api/business-billing");
    for (const r of ["tax/calculate", "tax-settings", "numbering"]) {
      expect(existsSync(path.join(api, r, "route.ts")), r).toBe(true);
    }
  });

  it.each(["invoices", "quotations", "sales-orders", "credit-notes", "debit-notes"])("/billing/%s has list, create, view and edit pages", (slug) => {
    for (const seg of ["", "create", "[id]", "[id]/edit"]) {
      expect(existsSync(path.join(billingDir, slug, seg, "page.tsx")), `${slug}/${seg}`).toBe(true);
    }
  });

  it("has the document APIs, branding settings and a print page outside the app shell", () => {
    const api = path.resolve(billingDir, "../../api/business-billing");
    for (const r of ["documents/[type]", "documents/[type]/[id]", "documents/[type]/[id]/issue", "documents/[type]/[id]/void", "documents/[type]/[id]/respond", "documents/[type]/[id]/convert", "documents/lookups", "branding"]) {
      expect(existsSync(path.join(api, r, "route.ts")), r).toBe(true);
    }
    expect(existsSync(path.join(billingDir, "settings/branding/page.tsx"))).toBe(true);
    expect(existsSync(path.resolve(billingDir, "../../(print)/billing/print/[type]/[id]/page.tsx"))).toBe(true);
  });
});
