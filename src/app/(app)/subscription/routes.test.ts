import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import nextConfig from "../../../../next.config";

const appDir = path.resolve(__dirname, "..");
const ROUTES = ["", "plans", "current", "history", "invoices", "payments", "settings"];

describe("subscription routes", () => {
  it.each(ROUTES)("/subscription/%s has a page", (segment) => {
    expect(existsSync(path.join(appDir, "subscription", segment, "page.tsx"))).toBe(true);
  });

  it("keeps subscription APIs under /api/subscription and Business Billing under /api/business-billing", () => {
    const api = path.resolve(appDir, "../api");
    for (const r of ["", "seats", "return", "payments", "settings", "change", "plans", "cancel", "resume", "entitlements"]) {
      expect(existsSync(path.join(api, "subscription", r, "route.ts")), `/api/subscription/${r}`).toBe(true);
    }
    for (const r of ["overview", "settings"]) {
      expect(existsSync(path.join(api, "business-billing", r, "route.ts")), `/api/business-billing/${r}`).toBe(true);
    }
    expect(existsSync(path.join(api, "billing"))).toBe(false);
  });

  it("no longer redirects /billing: that path is Business Billing now", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.find((r) => r.source === "/billing")).toBeUndefined();
  });
});
