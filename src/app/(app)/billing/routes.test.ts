import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BILLING_NAV, BILLING_SECTIONS } from "./_components/sections";

const billingDir = __dirname;
const REQUIRED = ["", "invoices", "quotations", "customers", "suppliers", "products", "services", "payments", "purchases", "stock", "accounting", "reports", "settings"];

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

  it.each(["invoices", "quotations", "sales-orders", "credit-notes", "debit-notes", "purchase-orders", "purchase-bills", "purchase-returns"])("/billing/%s has list, create, view and edit pages", (slug) => {
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
    expect(existsSync(path.join(billingDir, "settings/templates/page.tsx"))).toBe(true);
    for (const r2 of ["documents/[type]/[id]/pdf", "payments/[id]/pdf", "template", "template/images/[kind]"]) {
      expect(existsSync(path.join(api, r2, "route.ts")), r2).toBe(true);
    }
    expect(existsSync(path.resolve(billingDir, "../../(print)/billing/print/[type]/[id]/page.tsx"))).toBe(true);
  });

  it("has supplier payments, payables and their APIs", () => {
    for (const seg of ["supplier-payments", "supplier-payments/create", "supplier-payments/[id]", "payables"]) {
      expect(existsSync(path.join(billingDir, seg, "page.tsx")), seg).toBe(true);
    }
    const api = path.resolve(billingDir, "../../api/business-billing");
    for (const r of ["supplier-payments", "supplier-payments/[id]", "supplier-payments/[id]/allocate", "supplier-payments/[id]/void", "supplier-payments/open-items", "suppliers/[id]/account", "payables", "documents/[type]/[id]/received"]) {
      expect(existsSync(path.join(api, r, "route.ts")), r).toBe(true);
    }
  });

  it("guards every API route (security review): billing permission, sign-in, or a reviewed public route", () => {
    const apiDir = path.resolve(billingDir, "../../api");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "route.ts") files.push(p);
      }
    };
    walk(apiDir);
    // Public on purpose, each with its own check: the secret token, a signature, or the cron secret.
    const PUBLIC: Record<string, string> = {
      "auth/[...all]": "toNextJsHandler",
      "share/[token]": "resolveShare",
      "webhooks/payu": "verifyPayuHash",
      "subscription/return": "verifyPayuHash",
      "webhooks/whatsapp": "timingSafeEqual",
      "cron/billing": "cronJob",
      "cron/reminders": "cronJob",
    };
    const unguarded: string[] = [];
    for (const f of files) {
      const rel = path.relative(apiDir, path.dirname(f)).split(path.sep).join("/");
      const src = readFileSync(f, "utf8");
      if (rel.startsWith("business-billing/")) {
        if (!src.includes("requireBillingPermission") || !src.includes("route(")) unguarded.push(rel);
      } else if (PUBLIC[rel]) {
        if (!src.includes(PUBLIC[rel])) unguarded.push(rel);
      } else if (!/requireOrgRole|requireSession/.test(src)) unguarded.push(rel);
    }
    expect(unguarded).toEqual([]);
    expect(files.length).toBeGreaterThan(100);
  });

  it("has the WhatsApp APIs, webhook and setup guide", () => {
    const api = path.resolve(billingDir, "../../api");
    for (const r of [
      "business-billing/whatsapp",
      "business-billing/whatsapp/connect",
      "business-billing/whatsapp/templates",
      "business-billing/documents/[type]/[id]/whatsapp",
      "business-billing/payments/[id]/whatsapp",
      "webhooks/whatsapp",
    ]) {
      expect(existsSync(path.join(api, r, "route.ts")), r).toBe(true);
    }
    expect(existsSync(path.resolve(billingDir, "../../../../docs/whatsapp-setup.md"))).toBe(true);
  });

  it("has recurring invoice pages and APIs, and one scheduled job", () => {
    for (const seg of ["recurring-invoices", "recurring-invoices/[id]"]) {
      expect(existsSync(path.join(billingDir, seg, "page.tsx")), seg).toBe(true);
    }
    const api = path.resolve(billingDir, "../../api");
    for (const r of ["business-billing/recurring-invoices", "business-billing/recurring-invoices/[id]", "business-billing/recurring-invoices/[id]/status", "business-billing/recurring-invoices/[id]/template", "business-billing/recurring-invoices/[id]/run", "cron/billing"]) {
      expect(existsSync(path.join(api, r, "route.ts")), r).toBe(true);
    }
  });

  it("has email, sharing and reminder pages and APIs", () => {
    expect(existsSync(path.join(billingDir, "settings/communication/page.tsx"))).toBe(true);
    const api = path.resolve(billingDir, "../../api");
    for (const r of [
      "business-billing/documents/[type]/[id]/email",
      "business-billing/documents/[type]/[id]/share",
      "business-billing/documents/[type]/[id]/messages",
      "business-billing/documents/[type]/[id]/remind",
      "business-billing/payments/[id]/email",
      "business-billing/payments/[id]/share",
      "business-billing/payments/[id]/messages",
      "business-billing/communication-settings",
      "cron/reminders",
      "share/[token]",
    ]) {
      expect(existsSync(path.join(api, r, "route.ts")), r).toBe(true);
    }
    // The public share page lives outside the app shell and the login proxy.
    expect(existsSync(path.resolve(billingDir, "../../share/[token]/page.tsx"))).toBe(true);
    const proxy = readFileSync(path.resolve(billingDir, "../../../proxy.ts"), "utf8");
    expect(proxy).not.toContain('"/share');
  });

  it("has the inventory pages and APIs", () => {
    for (const seg of ["stock", "stock/[productId]", "warehouses", "stock-adjustments", "stock-adjustments/create", "stock-adjustments/[id]", "settings/inventory", "reports/inventory"]) {
      expect(existsSync(path.join(billingDir, seg, "page.tsx")), seg).toBe(true);
    }
    const api = path.resolve(billingDir, "../../api/business-billing");
    for (const r of ["warehouses", "warehouses/[id]", "warehouses/[id]/archive", "warehouses/[id]/default", "stock", "stock/[productId]", "stock/available", "stock-adjustments", "stock-adjustments/[id]", "stock-adjustments/[id]/void", "inventory-settings"]) {
      expect(existsSync(path.join(api, r, "route.ts")), r).toBe(true);
    }
  });

  it("has the report pages, the dashboard API and the export API", () => {
    for (const seg of ["reports", "reports/sales", "reports/purchases", "reports/payments", "reports/tax"]) {
      expect(existsSync(path.join(billingDir, seg, "page.tsx")), seg).toBe(true);
    }
    const api = path.resolve(billingDir, "../../api/business-billing");
    for (const r of ["dashboard", "reports/[report]"]) {
      expect(existsSync(path.join(api, r, "route.ts")), r).toBe(true);
    }
  });

  it("has the accounting pages and APIs", () => {
    for (const seg of ["accounting", "journal-entries", "journal-entries/create", "journal-entries/[id]", "ledger", "trial-balance", "profit-loss", "balance-sheet", "settings/accounting"]) {
      expect(existsSync(path.join(billingDir, seg, "page.tsx")), seg).toBe(true);
    }
    const api = path.resolve(billingDir, "../../api/business-billing/accounting");
    for (const r of ["accounts", "accounts/[id]", "accounts/[id]/archive", "journal", "journal/lookups", "journal/[id]", "journal/[id]/reverse", "ledger", "trial-balance", "profit-loss", "balance-sheet", "settings", "backfill"]) {
      expect(existsSync(path.join(api, r, "route.ts")), r).toBe(true);
    }
  });
});
