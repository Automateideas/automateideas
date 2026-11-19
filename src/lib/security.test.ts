import { describe, expect, it } from "vitest";

import { route } from "./access";
import { entityOf, redact } from "./audit";
import { rateLimit } from "./rate-limit";

describe("audit trail helpers", () => {
  it("masks secrets anywhere in a request body", () => {
    expect(redact({ to: "a@b.co", code: "abc123", nested: { accessToken: "EAAG", pin: "123456", name: "Ravi" }, list: [{ secret: "x" }] })).toEqual({
      to: "a@b.co",
      code: "[redacted]",
      nested: { accessToken: "[redacted]", pin: "[redacted]", name: "Ravi" },
      list: [{ secret: "[redacted]" }],
    });
    expect(redact({ message: "x".repeat(800) })).toEqual({ message: `${"x".repeat(500)}…` });
  });

  it("reads what was changed from the API path", () => {
    const id = "4b3e7c2a-1d2f-4e5a-9b8c-0a1b2c3d4e5f";
    expect(entityOf(`/api/business-billing/documents/invoices/${id}/issue`)).toEqual({ entityType: "invoices", entityId: id, action: "issue" });
    expect(entityOf("/api/business-billing/documents/invoices")).toEqual({ entityType: "invoices", entityId: null, action: "" });
    expect(entityOf(`/api/business-billing/payments/${id}/void`)).toEqual({ entityType: "payments", entityId: id, action: "void" });
    expect(entityOf("/api/business-billing/communication-settings")).toEqual({ entityType: "communication-settings", entityId: null, action: "" });
  });
});

describe("rate limiter", () => {
  it("allows the limit per window, then refuses until it resets", () => {
    const key = `t-${Math.random()}`;
    const t = 1_000_000;
    expect([1, 2, 3].map(() => rateLimit(key, 3, 60_000, t).ok)).toEqual([true, true, true]);
    const blocked = rateLimit(key, 3, 60_000, t + 1000);
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 59 });
    expect(rateLimit(key, 3, 60_000, t + 60_000).ok).toBe(true);
  });
});

describe("cross-site requests", () => {
  const handler = route(async (_request: Request) => Response.json({ ok: true }));
  const req = (method: string, origin: string | null) => new Request("http://localhost:3000/api/team", { method, headers: { ...(origin ? { origin } : {}), host: "localhost:3000" } });

  it("refuses changes sent from another website", async () => {
    const r = await handler(req("POST", "https://evil.example"));
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("CROSS_SITE_REQUEST");
  });

  it("allows this app's own origin, requests without an Origin, and reads from anywhere", async () => {
    expect((await handler(req("POST", "http://localhost:3000"))).status).toBe(200);
    expect((await handler(req("DELETE", null))).status).toBe(200);
    expect((await handler(req("GET", "https://evil.example"))).status).toBe(200);
  });
});
