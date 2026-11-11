import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { removeTestTenants } from "@/test/cleanup-tenants";

import { validateCustomer } from "../contacts-validation";
import { createCustomer, updateCustomer } from "../customers";
import { createDraft, issueDocument, voidDocument } from "../documents/service";
import { validateDocument } from "../documents/validation";
import { recordPayment } from "../payments/service";
import { saveBillingSettings } from "../settings";
import { withTenant } from "../tenant-db";
import { sharedSummary } from "./public";
import {
  autoSendReceipt,
  listMessages,
  runCompanyReminders,
  sendDocumentEmail,
  sendReminderNow,
  setCommunicationSettings,
  shareDocument,
} from "./service";
import { DEFAULT_COMMUNICATION } from "./settings";
import { hashToken, resolveShare, revokeShares } from "./shares";

// Real database, emails recorded but not sent (EMAIL_DELIVERY=log).

const stamp = Date.now().toString(36);
const A = `comtest-a-${stamp}`;
const B = `comtest-b-${stamp}`;
const USER = null as unknown as string;
const ids: Record<string, string> = {};
let previousMode: string | undefined;

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String((e as Error).message ?? e);
  }
}
const tokenOf = (url: string) => url.split("/share/")[1];

async function invoice(over: Record<string, unknown> = {}, org = A) {
  const v = validateDocument("invoices", { customerId: ids.customer, issueDate: "2026-11-01", extraDate: "2026-11-05", lines: [{ description: "Work", quantity: "1", rate: "1000", taxRate: "18" }], ...over });
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return issueDocument(org, USER, "invoices", (await createDraft(org, USER, "invoices", v.values)).id);
}

beforeAll(async () => {
  previousMode = process.env.EMAIL_DELIVERY;
  process.env.EMAIL_DELIVERY = "log";
  await db.insert(organization).values([
    { id: A, name: "Com A", slug: A, createdAt: new Date() },
    { id: B, name: "Com B", slug: B, createdAt: new Date() },
  ]);
  const company = { legalName: "Mail Co", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: "accounts@mailco.test", phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, countryCode: "IN", currency: "INR" as const, financialYearStartMonth: 4, invoicePrefix: "INV" };
  await saveBillingSettings(A, USER, company);
  await saveBillingSettings(B, USER, { ...company, legalName: "Other Co" });
  const c = validateCustomer({ name: "Ravi Traders", email: "ravi@ravi.test", phone: "98765 43210", paymentTermsDays: "4", billingAddress: { countryCode: "IN", stateCode: "27" } });
  if (!c.ok) throw new Error();
  ids.customer = (await createCustomer(A, USER, c.values)).id;
  ids.customerValues = JSON.stringify(c.values);
  ids.invoice = (await invoice()).id;
});

afterAll(async () => {
  process.env.EMAIL_DELIVERY = previousMode;
  await removeTestTenants([A, B]);
});

describe("sending documents", () => {
  it("emails an issued invoice and logs it; drafts can't be sent", async () => {
    const r = await sendDocumentEmail(A, USER, "invoices", ids.invoice, { to: ["ravi@ravi.test"], cc: [], subject: null, message: null, attachPdf: true });
    expect(r).toMatchObject({ status: "logged" });
    const log = await listMessages(A, "invoices", ids.invoice);
    expect(log[0]).toMatchObject({ channel: "email", kind: "document", recipient: "ravi@ravi.test", status: "logged" });
    expect(log[0].subject).toMatch(/^Invoice INV\/2026-27\/\d+ from Mail Co$/);
    const v = validateDocument("invoices", { customerId: ids.customer, issueDate: "2026-11-01", lines: [{ description: "x", quantity: "1", rate: "1", taxRate: "0" }] });
    if (!v.ok) throw new Error();
    const draft = await createDraft(A, USER, "invoices", v.values);
    expect(await code(sendDocumentEmail(A, USER, "invoices", draft.id, { to: ["a@b.co"], cc: [], subject: null, message: null, attachPdf: false }))).toBe("NOT_ISSUED");
  });

  it("refuses without an email setup", async () => {
    process.env.EMAIL_DELIVERY = "";
    const key = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    expect(await code(sendDocumentEmail(A, USER, "invoices", ids.invoice, { to: ["a@b.co"], cc: [], subject: null, message: null, attachPdf: false }))).toBe("EMAIL_NOT_CONFIGURED");
    process.env.RESEND_API_KEY = key;
    process.env.EMAIL_DELIVERY = "log";
  });
});

describe("share links", () => {
  it("a link opens only its own document; WhatsApp text uses the customer's number", async () => {
    const s = await shareDocument(A, USER, "invoices", ids.invoice, "whatsapp");
    expect(s.whatsapp.phone).toBe("919876543210");
    expect(s.whatsapp.url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    const token = tokenOf(s.url);
    expect(await resolveShare(token)).toEqual({ organizationId: A, documentType: "invoices", documentId: ids.invoice });
    const summary = await sharedSummary(token);
    expect(summary).toMatchObject({ company: "Mail Co", label: "Invoice", totalPaise: 118000, balancePaise: 118000, void: false });
    expect((await listMessages(A, "invoices", ids.invoice)).some((m) => m.channel === "whatsapp")).toBe(true);
    expect(await resolveShare("x".repeat(32))).toBeNull();
    expect(await resolveShare("not-a-token")).toBeNull();
  });

  it("with only a token, the database shows that one share row and nothing else", async () => {
    const s = await shareDocument(A, USER, "invoices", ids.invoice, "link");
    const hash = hashToken(tokenOf(s.url));
    const seen = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role billing_tenant`);
      await tx.execute(sql`select set_config('app.share_token', ${hash}, true)`);
      const shares = await tx.execute<{ n: string }>(sql`select count(*) as n from document_shares`);
      const invoices = await tx.execute<{ n: string }>(sql`select count(*) as n from business_invoices`);
      const customers = await tx.execute<{ n: string }>(sql`select count(*) as n from customers`);
      return [shares.rows[0].n, invoices.rows[0].n, customers.rows[0].n].map(Number);
    });
    expect(seen).toEqual([1, 0, 0]);
  });

  it("revoked and expired links stop working; voided documents say so", async () => {
    const s = await shareDocument(A, USER, "invoices", ids.invoice, "link");
    await revokeShares(A, "invoices", ids.invoice, USER);
    expect(await resolveShare(tokenOf(s.url))).toBeNull();
    const fresh = await shareDocument(A, USER, "invoices", ids.invoice, "link");
    await withTenant(A, (tx) => tx.execute(sql`update document_shares set expires_at = now() - interval '1 day' where token_hash = ${hashToken(tokenOf(fresh.url))}`));
    expect(await resolveShare(tokenOf(fresh.url))).toBeNull();
    const other = await invoice();
    const link = await shareDocument(A, USER, "invoices", other.id, "link");
    await voidDocument(A, USER, "invoices", other.id, "Mistake");
    expect((await sharedSummary(tokenOf(link.url)))?.void).toBe(true);
  });
});

describe("reminders", () => {
  it("off by default; on: sends the due stage once even if run twice at once", async () => {
    const now = new Date("2026-11-12T06:00:00Z"); // 11:30 IST, 7 days after the 5 Nov due date
    expect((await runCompanyReminders(A, now)).sent).toBe(0);
    await setCommunicationSettings(A, USER, { ...DEFAULT_COMMUNICATION, reminders: { ...DEFAULT_COMMUNICATION.reminders, enabled: true } });
    const [x, y] = await Promise.all([runCompanyReminders(A, now), runCompanyReminders(A, now)]);
    expect(x.sent + y.sent).toBe(1);
    expect((await runCompanyReminders(A, now)).sent).toBe(0);
    const log = (await listMessages(A, "invoices", ids.invoice)).filter((m) => m.kind === "reminder");
    expect(log).toHaveLength(1);
    expect(log[0].subject).toMatch(/^Overdue: invoice .* \(7 days late\)$/);
    // A week later: the next stage.
    expect((await runCompanyReminders(A, new Date("2026-11-19T06:00:00Z"))).sent).toBe(1);
  });

  it("not before the send hour; not for customers who opted out; not for paid invoices", async () => {
    expect((await runCompanyReminders(A, new Date("2026-11-26T01:00:00Z"))).sent).toBe(0); // 06:30 IST
    const v = { ...JSON.parse(ids.customerValues), sendReminders: false };
    expect((await updateCustomer(A, USER, ids.customer, v)).sendReminders).toBe(false);
    expect((await runCompanyReminders(A, new Date("2026-11-26T06:00:00Z"))).sent).toBe(0);
    await updateCustomer(A, USER, ids.customer, { ...v, sendReminders: true });
    await recordPayment(A, USER, { customerId: ids.customer, paymentDate: "2026-11-11", amountPaise: 118000, method: "upi", reference: "U1", notes: null, allocations: [{ invoiceId: ids.invoice, amountPaise: 118000 }] }, null);
    expect(await code(sendReminderNow(A, USER, ids.invoice))).toBe("PAID");
  });

  it("send now works off-schedule and logs without a dedupe key", async () => {
    const inv = await invoice({ issueDate: "2026-11-10", extraDate: "2026-11-30" });
    expect(await sendReminderNow(A, USER, inv.id)).toMatchObject({ status: "logged" });
    expect(await sendReminderNow(A, USER, inv.id)).toMatchObject({ status: "logged" });
    expect((await listMessages(A, "invoices", inv.id)).filter((m) => m.kind === "reminder")).toHaveLength(2);
  });
});

describe("receipts and isolation", () => {
  it("automatic receipt only when turned on", async () => {
    const p = await recordPayment(A, USER, { customerId: ids.customer, paymentDate: "2026-11-11", amountPaise: 5000, method: "cash", reference: null, notes: null, allocations: [] }, null);
    expect(await autoSendReceipt(A, USER, p.id)).toBeNull();
    await setCommunicationSettings(A, USER, { ...DEFAULT_COMMUNICATION, autoReceiptEmail: true });
    expect(await autoSendReceipt(A, USER, p.id)).toMatchObject({ status: "logged" });
    expect((await listMessages(A, "receipt", p.id))[0]).toMatchObject({ kind: "receipt", recipient: "ravi@ravi.test" });
  });

  it("another company can't send, share or read our documents", async () => {
    expect(await code(sendDocumentEmail(B, USER, "invoices", ids.invoice, { to: ["a@b.co"], cc: [], subject: null, message: null, attachPdf: false }))).toBe("NOT_FOUND");
    expect(await code(shareDocument(B, USER, "invoices", ids.invoice, "link"))).toBe("NOT_FOUND");
    expect(await listMessages(B, "invoices", ids.invoice)).toHaveLength(0);
  });
});
