import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { removeTestTenants } from "@/test/cleanup-tenants";

import { listMessages } from "../communication/service";
import { validateCustomer } from "../contacts-validation";
import { createCustomer, setCustomerArchived } from "../customers";
import { createDraft, getDocument } from "../documents/service";
import { todayInIndia } from "../documents/types";
import { validateDocument } from "../documents/validation";
import { saveBillingSettings } from "../settings";
import { addDays, occurrence } from "./schedule";
import { createRecurring, getRecurring, listRecurring, replaceTemplate, runCompanyRecurring, runNow, setRecurringStatus, updateRecurring } from "./service";
import type { ScheduleValues } from "./schedule";

// Real database: recurring invoices created on schedule, exactly once.

const stamp = Date.now().toString(36);
const A = `rectest-a-${stamp}`;
const B = `rectest-b-${stamp}`;
const USER = null as unknown as string;
const ids: Record<string, string> = {};
const TODAY = todayInIndia();
const START = addDays(TODAY, 2);
const at = (date: string) => new Date(`${date}T06:00:00Z`); // 11:30 India time
let previousMode: string | undefined;

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String((e as Error).message ?? e);
  }
}

async function draftInvoice(customerId: string, rate = "1000", org = A) {
  const v = validateDocument("invoices", { customerId, issueDate: TODAY, lines: [{ description: "Monthly retainer", quantity: "1", rate, taxRate: "18" }], notes: "Thanks!" });
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return (await createDraft(org, USER, "invoices", v.values)).id;
}
const schedule = (over: Partial<ScheduleValues> = {}): ScheduleValues => ({ name: "Retainer", frequency: "monthly", interval: 1, startDate: START, endDate: null, maxCount: null, dueDays: 10, autoIssue: true, autoEmail: false, ...over });

beforeAll(async () => {
  previousMode = process.env.EMAIL_DELIVERY;
  process.env.EMAIL_DELIVERY = "log";
  await db.insert(organization).values([
    { id: A, name: "Rec A", slug: A, createdAt: new Date() },
    { id: B, name: "Rec B", slug: B, createdAt: new Date() },
  ]);
  const company = { legalName: "Repeat Co", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, countryCode: "IN", currency: "INR" as const, financialYearStartMonth: 4, invoicePrefix: "INV" };
  await saveBillingSettings(A, USER, company);
  await saveBillingSettings(B, USER, { ...company, legalName: "Other Co" });
  const c = validateCustomer({ name: "Ravi", email: "ravi@ravi.test", billingAddress: { countryCode: "IN", stateCode: "27" } });
  const c2 = validateCustomer({ name: "Meera", billingAddress: { countryCode: "IN", stateCode: "27" } });
  if (!c.ok || !c2.ok) throw new Error();
  ids.customer = (await createCustomer(A, USER, c.values)).id;
  ids.other = (await createCustomer(A, USER, c2.values)).id;
  ids.source = await draftInvoice(ids.customer);
});

afterAll(async () => {
  process.env.EMAIL_DELIVERY = previousMode;
  await removeTestTenants([A, B]);
});

describe("making an invoice recurring", () => {
  it("copies the customer and items; refuses a start in the past", async () => {
    expect(await code(createRecurring(A, USER, ids.source, schedule({ startDate: addDays(TODAY, -1) })))).toBe("INVALID_FIELDS");
    const r = await createRecurring(A, USER, ids.source, schedule());
    ids.rec = r.id;
    expect(r).toMatchObject({ customerName: "Ravi", nextRunDate: START, generatedCount: 0, status: "active", totalPaise: 118000 });
    expect(r.items).toEqual([{ description: "Monthly retainer", quantity: "1.000", ratePaise: 100000, taxRate: "18.0000" }]);
  });
});

describe("running on schedule", () => {
  it("nothing before the date; on the date one issued invoice, dated and due as set", async () => {
    expect((await runCompanyRecurring(A, at(TODAY))).created).toBe(0);
    const r = await runCompanyRecurring(A, at(START));
    expect(r).toEqual({ created: 1, issued: 1, failed: 0 });
    const rec = await getRecurring(A, ids.rec);
    expect(rec).toMatchObject({ generatedCount: 1, lastRunDate: START, nextRunDate: occurrence(START, "monthly", 1, 1) });
    const inv = await getDocument(A, "invoices", rec.runs[0].invoiceId!);
    expect(inv).toMatchObject({ status: "issued", issueDate: START, extraDate: addDays(START, 10), totalPaise: 118000, notes: "Thanks!" });
    // Same day again: nothing new.
    expect((await runCompanyRecurring(A, at(START))).created).toBe(0);
  });

  it("two runs at the same moment create one invoice", async () => {
    const next = (await getRecurring(A, ids.rec)).nextRunDate!;
    const [x, y] = await Promise.all([runCompanyRecurring(A, at(next)), runCompanyRecurring(A, at(next))]);
    expect(x.created + y.created).toBe(1);
    expect((await getRecurring(A, ids.rec)).generatedCount).toBe(2);
  });

  it("catches up missed dates, each dated as scheduled", async () => {
    const third = occurrence(START, "monthly", 1, 2);
    const fifth = occurrence(START, "monthly", 1, 4);
    expect((await runCompanyRecurring(A, at(fifth))).created).toBe(3);
    const rec = await getRecurring(A, ids.rec);
    expect(rec.runs.slice(0, 3).map((r) => r.runDate).sort()).toEqual([third, occurrence(START, "monthly", 1, 3), fifth]);
    expect(rec.generatedCount).toBe(5);
  });

  it("emails when set to (recorded in test mode)", async () => {
    const rec = await getRecurring(A, ids.rec);
    await updateRecurring(A, USER, ids.rec, schedule({ startDate: START, autoEmail: true }));
    const r = await runCompanyRecurring(A, at(rec.nextRunDate!));
    expect(r.created).toBe(1);
    const run = (await getRecurring(A, ids.rec)).runs[0];
    expect(run.status).toBe("emailed");
    expect((await listMessages(A, "invoices", run.invoiceId!))[0]).toMatchObject({ kind: "document", recipient: "ravi@ravi.test" });
  });
});

describe("controls", () => {
  it("pause stops it; resume skips the missed dates", async () => {
    await setRecurringStatus(A, USER, ids.rec, "pause");
    const before = await getRecurring(A, ids.rec);
    expect((await runCompanyRecurring(A, at(addDays(before.nextRunDate!, 40)))).created).toBe(0);
    const resumed = await setRecurringStatus(A, USER, ids.rec, "resume");
    expect(resumed.status).toBe("active");
    expect(resumed.nextRunDate! >= TODAY).toBe(true);
  });

  it("drafts only, when not issuing automatically", async () => {
    const r = await createRecurring(A, USER, ids.source, schedule({ name: "Drafts", autoIssue: false, maxCount: 2 }));
    expect((await runCompanyRecurring(A, at(START))).created).toBeGreaterThanOrEqual(1);
    const rec = await getRecurring(A, r.id);
    expect(rec.runs[0].status).toBe("created");
    expect((await getDocument(A, "invoices", rec.runs[0].invoiceId!)).status).toBe("draft");
    // Ends after the maximum count.
    await runCompanyRecurring(A, at(occurrence(START, "monthly", 1, 1)));
    expect(await getRecurring(A, r.id)).toMatchObject({ status: "ended", nextRunDate: null, generatedCount: 2 });
  });

  it("a template that no longer works is logged and skipped, not retried forever", async () => {
    const r = await createRecurring(A, USER, await draftInvoice(ids.other), schedule({ name: "Meera" }));
    await setCustomerArchived(A, USER, ids.other, true);
    const result = await runCompanyRecurring(A, at(START));
    expect(result.failed).toBeGreaterThanOrEqual(1);
    const rec = await getRecurring(A, r.id);
    expect(rec.runs[0]).toMatchObject({ status: "failed", invoiceId: null });
    expect(rec.runs[0].error).toMatch(/archived/);
    expect(rec.nextRunDate).toBe(occurrence(START, "monthly", 1, 1));
    await setCustomerArchived(A, USER, ids.other, false);
  });

  it("replaces items from another invoice of the same customer only", async () => {
    const bigger = await draftInvoice(ids.customer, "2500");
    expect((await replaceTemplate(A, USER, ids.rec, bigger)).totalPaise).toBe(295000);
    expect(await code(replaceTemplate(A, USER, ids.rec, await draftInvoice(ids.other)))).toBe("INVALID_FIELDS");
  });

  it("create the next invoice now: dated today, schedule moves on", async () => {
    const before = await getRecurring(A, ids.rec);
    const { run, recurring } = await runNow(A, USER, ids.rec);
    expect((await getDocument(A, "invoices", run.invoiceId!)).issueDate).toBe(TODAY);
    expect(recurring.generatedCount).toBe(before.generatedCount + 1);
    expect(recurring.nextRunDate! > before.nextRunDate!).toBe(true);
    await setRecurringStatus(A, USER, ids.rec, "end");
    expect(await code(runNow(A, USER, ids.rec))).toBe("NOT_ACTIVE");
  });

  it("is per company", async () => {
    expect(await code(getRecurring(B, ids.rec))).toBe("NOT_FOUND");
    expect((await listRecurring(B, { q: null, status: null, page: 1, pageSize: 25, customerId: null })).total).toBe(0);
    expect(await code(createRecurring(B, USER, ids.source, schedule()))).toBe("NOT_FOUND");
  });
});
