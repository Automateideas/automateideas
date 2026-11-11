import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { removeTestTenants } from "@/test/cleanup-tenants";

import { validateCustomer } from "../business-billing/contacts-validation";
import { createCustomer } from "../business-billing/customers";
import { createDraft, issueDocument, voidDocument } from "../business-billing/documents/service";
import { todayInIndia } from "../business-billing/documents/types";
import { validateDocument } from "../business-billing/documents/validation";
import { saveBillingSettings } from "../business-billing/settings";
import { assertInvoiceQuota, invoiceUsage, invoicesIssuedThisMonth } from "./entitlements";

// Real database: the plan's monthly invoice cap, checked inside the issuing transaction.

const stamp = Date.now().toString(36);
const A = `quotatest-a-${stamp}`;
const USER = null as unknown as string;
let customerId = "";

const plan = (cap: number | null) => ({ limits: { maxSeats: 10, maxInvoicesPerMonth: cap }, effectivePlanId: "starter" as const });
async function draft(issueDate = todayInIndia()) {
  const v = validateDocument("invoices", { customerId, issueDate, lines: [{ description: "Work", quantity: "1", rate: "100", taxRate: "18" }] });
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return (await createDraft(A, USER, "invoices", v.values)).id;
}
const issueWithCap = (id: string, cap: number | null) => issueDocument(A, USER, "invoices", id, (tx) => assertInvoiceQuota(A, plan(cap), tx));
async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String(e);
  }
}

beforeAll(async () => {
  await db.insert(organization).values({ id: A, name: "Quota A", slug: A, createdAt: new Date() });
  await saveBillingSettings(A, USER, { legalName: "Quota Co", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, countryCode: "IN", currency: "INR", financialYearStartMonth: 4, invoicePrefix: "INV" });
  const c = validateCustomer({ name: "Buyer", billingAddress: { countryCode: "IN", stateCode: "27" } });
  if (!c.ok) throw new Error();
  customerId = (await createCustomer(A, USER, c.values)).id;
});

afterAll(() => removeTestTenants([A]));

describe("monthly invoice cap", () => {
  it("counts invoices issued this month, refuses the one over the cap", async () => {
    expect(await invoicesIssuedThisMonth(A)).toBe(0);
    expect(await code(issueWithCap(await draft(), 2))).toBe("ok");
    // Backdated to last financial year: still issued this month, so it counts.
    expect(await code(issueWithCap(await draft("2026-04-01"), 2))).toBe("ok");
    expect(await invoicesIssuedThisMonth(A)).toBe(2);
    const third = await draft();
    expect(await code(issueWithCap(third, 2))).toBe("INVOICE_LIMIT_REACHED");
    // Refused: still a draft, nothing numbered.
    const { rows } = await db.execute<{ status: string; number: string | null }>(sql`select status, number from business_invoices where id = ${third}`);
    expect(rows[0]).toEqual({ status: "draft", number: null });
    expect(await code(issueWithCap(third, null))).toBe("ok"); // no cap (Pro)
  });

  it("a voided invoice frees its slot", async () => {
    const before = await invoicesIssuedThisMonth(A);
    const id = await draft();
    await issueWithCap(id, null);
    await voidDocument(A, USER, "invoices", id, "Mistake");
    expect(await invoicesIssuedThisMonth(A)).toBe(before);
  });

  it("two invoices issued at the same moment can't both take the last slot", async () => {
    const used = await invoicesIssuedThisMonth(A);
    const [x, y] = [await draft(), await draft()];
    const results = await Promise.all([code(issueWithCap(x, used + 1)), code(issueWithCap(y, used + 1))]);
    expect(results.sort()).toEqual(["INVOICE_LIMIT_REACHED", "ok"]);
    expect(await invoicesIssuedThisMonth(A)).toBe(used + 1);
  });

  it("reports usage for the subscription page", async () => {
    const u = await invoiceUsage(A, plan(500));
    expect(u).toMatchObject({ used: await invoicesIssuedThisMonth(A), cap: 500 });
    expect(u.month).toMatch(/^[A-Z][a-z]+ \d{4}$/);
  });
});
