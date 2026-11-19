import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { removeTestTenants } from "@/test/cleanup-tenants";

import { recordAudit, runWithAuditScope, setAuditActor } from "./audit";
import { listAuditLogs } from "./business-billing/audit-log";
import { assertSendRate } from "./business-billing/communication/limits";
import { withTenant } from "./business-billing/tenant-db";

// Real database: the audit trail and the hourly message cap.

const stamp = Date.now().toString(36);
const A = `audtest-a-${stamp}`;
const B = `audtest-b-${stamp}`;
const id = "4b3e7c2a-1d2f-4e5a-9b8c-0a1b2c3d4e5f";

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String((e as Error).message ?? e);
  }
}

beforeAll(async () => {
  await db.insert(organization).values([
    { id: A, name: "Aud A", slug: A, createdAt: new Date() },
    { id: B, name: "Aud B", slug: B, createdAt: new Date() },
  ]);
});

afterAll(() => removeTestTenants([A, B]));

describe("audit trail", () => {
  it("records a successful change with who, what, where; secrets masked", async () => {
    const body = JSON.stringify({ to: "ravi@x.co", code: "embedded-signup-code" });
    const request = new Request(`http://localhost/api/business-billing/documents/invoices/${id}/email`, { method: "POST", headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "test" }, body });
    await runWithAuditScope(async () => {
      setAuditActor(A, null as unknown as string);
      await recordAudit(request, body, Response.json({ ok: true }, { status: 201 }));
    });
    const { items } = await listAuditLogs(A, { page: 1, pageSize: 10, entityType: null, entityId: null });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ action: "invoices.email", entityType: "invoices", entityId: id, actor: "System", ipAddress: "203.0.113.9" });
    expect(items[0].details).toMatchObject({ method: "POST", body: { to: "ravi@x.co", code: "[redacted]" }, status: 201 });
  });

  it("skips failures, reads, and requests outside Business Billing", async () => {
    const post = new Request("http://localhost/api/business-billing/customers", { method: "POST" });
    await runWithAuditScope(async () => {
      setAuditActor(A, null as unknown as string);
      await recordAudit(post, null, Response.json({}, { status: 400 }));
      await recordAudit(new Request("http://localhost/api/business-billing/customers"), null, Response.json({}));
    });
    await runWithAuditScope(async () => recordAudit(post, null, Response.json({ id: "x" }, { status: 201 }))); // no actor set
    expect((await listAuditLogs(A, { page: 1, pageSize: 10, entityType: null, entityId: null })).total).toBe(1);
  });

  it("uses the new record's id when it's created", async () => {
    await runWithAuditScope(async () => {
      setAuditActor(A, null as unknown as string);
      await recordAudit(new Request("http://localhost/api/business-billing/customers", { method: "POST" }), null, Response.json({ id: "new-customer-id" }, { status: 201 }));
    });
    const { items } = await listAuditLogs(A, { page: 1, pageSize: 10, entityType: "customers", entityId: null });
    expect(items[0]).toMatchObject({ action: "customers.create", entityId: "new-customer-id" });
  });

  it("can't be changed or deleted, and other companies can't see it", async () => {
    expect(await code(withTenant(A, (tx) => tx.execute(sql`update audit_logs set action = 'x' where organization_id = ${A}`)))).not.toBe("ok");
    expect(await code(withTenant(A, (tx) => tx.execute(sql`delete from audit_logs where organization_id = ${A}`)))).not.toBe("ok");
    expect((await listAuditLogs(B, { page: 1, pageSize: 10, entityType: null, entityId: null })).total).toBe(0);
  });
});

describe("hourly message cap", () => {
  it("refuses once the company has sent the maximum in the last hour", async () => {
    const previous = process.env.BILLING_MESSAGES_PER_HOUR;
    process.env.BILLING_MESSAGES_PER_HOUR = "2";
    try {
      await assertSendRate(A);
      await withTenant(A, (tx) =>
        tx.execute(sql`insert into billing_messages (organization_id, channel, kind, document_type, document_id, recipient, status) values
          (${A}, 'email', 'document', 'invoices', 'x', 'a@b.co', 'sent'), (${A}, 'email', 'document', 'invoices', 'x', 'a@b.co', 'failed'), (${A}, 'whatsapp', 'document', 'invoices', 'x', '+91', 'sent')`),
      );
      expect(await code(assertSendRate(A))).toBe("SEND_LIMIT"); // 2 counted (failed ones don't)
      expect(await code(assertSendRate(A, new Date(Date.now() + 2 * 3_600_000)))).toBe("ok"); // an hour later
      expect(await code(assertSendRate(B))).toBe("ok"); // per company
    } finally {
      if (previous === undefined) delete process.env.BILLING_MESSAGES_PER_HOUR;
      else process.env.BILLING_MESSAGES_PER_HOUR = previous;
    }
  });
});
