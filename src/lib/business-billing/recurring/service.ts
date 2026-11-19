import { and, asc, count, desc, eq, ilike, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { businessInvoices, customers, organization, recurringInvoiceRuns, recurringInvoices } from "@/db/schema";
import { assertInvoiceQuota, getEntitlements } from "@/lib/subscription-billing/entitlements";

import { sendDocumentEmail } from "../communication/service";
import { createDraftIn, getDocument, issueDocument, valuesFromStored } from "../documents/service";
import { todayInIndia } from "../documents/types";
import type { DocumentValues } from "../documents/validation";
import { conflict, invalid, notFound, paged } from "../records";
import { type TenantTx, withTenant } from "../tenant-db";
import { type Frequency, type ScheduleValues, addDays, describeSchedule, occurrence } from "./schedule";

// Recurring invoices: a schedule plus a template copied from an invoice.
//
// Each run, in ONE transaction: the schedule row is locked, a draft invoice
// is created from the template, a run row is written (unique per date) and
// the schedule moves to its next date. So a double run, or two schedulers at
// once, can never bill the same date twice. Issuing and emailing happen
// after that; if they fail, the draft stays and the run records why.

type Template = Omit<DocumentValues, "partyId" | "issueDate" | "extraDate" | "sourceId" | "reason" | "partyReference">;
type Profile = typeof recurringInvoices.$inferSelect;
type Schedule = { startDate: string; frequency: Frequency; interval: number; endDate: string | null; maxCount: number | null };

const MAX_CATCH_UP = 12;

/** A readable reason from a refused request: the field messages when there are any ("This customer is archived…"), else the message. */
function reason(e: unknown): string {
  const body = (e as { body?: { message?: string; fields?: Record<string, string> } }).body;
  const fields = body?.fields ? Object.values(body.fields).filter(Boolean) : [];
  return fields.length ? fields.join(" ") : (body?.message ?? (e as Error).message ?? String(e));
}

/**
 * The first scheduled date after `after` (and not before `notBefore`), or
 * null when the schedule has ended (end date passed or `count` reached the maximum).
 */
export function nextAfter(s: Schedule, after: string | null, count: number, notBefore: string | null = null): string | null {
  if (s.maxCount !== null && count >= s.maxCount) return null;
  for (let n = 0; n < 5000; n++) {
    const d = occurrence(s.startDate, s.frequency, s.interval, n);
    if (s.endDate && d > s.endDate) return null;
    if ((after === null || d > after) && (notBefore === null || d >= notBefore)) return d;
  }
  return null;
}

function templateFrom(v: DocumentValues): Template {
  const t: Partial<DocumentValues> = { ...v };
  delete t.partyId;
  delete t.issueDate;
  delete t.extraDate;
  delete t.sourceId;
  delete t.reason;
  delete t.partyReference;
  return t as Template;
}

async function readProfile(tx: TenantTx, organizationId: string, id: string, lock = false) {
  const q = tx.select().from(recurringInvoices).where(and(eq(recurringInvoices.organizationId, organizationId), eq(recurringInvoices.id, id)));
  const [p] = lock ? await q.for("update") : await q;
  if (!p) notFound("recurring invoice");
  return p;
}

const scheduleOf = (p: Pick<Profile, "startDate" | "frequency" | "interval" | "endDate" | "maxCount">): Schedule => ({ ...p, frequency: p.frequency as Frequency });

/** An invoice to copy items from: same company, not void. */
async function sourceInvoice(organizationId: string, invoiceId: string) {
  const doc = await getDocument(organizationId, "invoices", invoiceId);
  if (doc.status === "void") conflict("VOID", "This invoice is void. Choose another to copy from.");
  return doc;
}

/* ---------------- Reading ---------------- */

async function detail(tx: TenantTx, organizationId: string, id: string) {
  const p = await readProfile(tx, organizationId, id);
  const [c] = await tx.select({ name: customers.name, email: customers.email }).from(customers).where(and(eq(customers.organizationId, organizationId), eq(customers.id, p.customerId)));
  const runs = await tx
    .select({
      id: recurringInvoiceRuns.id,
      runDate: recurringInvoiceRuns.runDate,
      status: recurringInvoiceRuns.status,
      error: recurringInvoiceRuns.error,
      invoiceId: recurringInvoiceRuns.invoiceId,
      invoiceNumber: businessInvoices.number,
      invoiceStatus: businessInvoices.status,
      totalPaise: businessInvoices.totalPaise,
    })
    .from(recurringInvoiceRuns)
    .leftJoin(businessInvoices, and(eq(businessInvoices.organizationId, recurringInvoiceRuns.organizationId), eq(businessInvoices.id, recurringInvoiceRuns.invoiceId)))
    .where(and(eq(recurringInvoiceRuns.organizationId, organizationId), eq(recurringInvoiceRuns.recurringInvoiceId, id)))
    .orderBy(desc(recurringInvoiceRuns.runDate))
    .limit(50);
  const template = p.template as Template;
  return {
    id: p.id,
    name: p.name,
    customerId: p.customerId,
    customerName: c?.name ?? "",
    customerEmail: c?.email ?? null,
    frequency: p.frequency as Frequency,
    interval: p.interval,
    startDate: p.startDate,
    endDate: p.endDate,
    maxCount: p.maxCount,
    nextRunDate: p.nextRunDate,
    lastRunDate: p.lastRunDate,
    generatedCount: p.generatedCount,
    dueDays: p.dueDays,
    autoIssue: p.autoIssue,
    autoEmail: p.autoEmail,
    status: p.status as "active" | "paused" | "ended",
    totalPaise: p.totalPaise,
    sourceInvoiceId: p.sourceInvoiceId,
    schedule: describeSchedule(p.frequency as Frequency, p.interval, p.startDate),
    items: template.lines.map((l) => ({ description: l.description, quantity: l.quantity, ratePaise: l.ratePaise, taxRate: l.taxRate })),
    runs,
  };
}

export type RecurringDetail = Awaited<ReturnType<typeof detail>>;
export const getRecurring = (organizationId: string, id: string) => withTenant(organizationId, (tx) => detail(tx, organizationId, id));

export async function listRecurring(organizationId: string, q: { q: string | null; status: "active" | "paused" | "ended" | null; page: number; pageSize: number; customerId: string | null }) {
  return withTenant(organizationId, async (tx) => {
    const pattern = q.q ? `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const filter = and(
      eq(recurringInvoices.organizationId, organizationId),
      q.status ? eq(recurringInvoices.status, q.status) : undefined,
      q.customerId ? eq(recurringInvoices.customerId, q.customerId) : undefined,
      pattern ? or(ilike(recurringInvoices.name, pattern), ilike(customers.name, pattern)) : undefined,
    );
    const join = and(eq(customers.organizationId, recurringInvoices.organizationId), eq(customers.id, recurringInvoices.customerId));
    const [{ total }] = await tx.select({ total: count() }).from(recurringInvoices).innerJoin(customers, join).where(filter);
    const rows = await tx
      .select({
        id: recurringInvoices.id,
        name: recurringInvoices.name,
        customerName: customers.name,
        frequency: recurringInvoices.frequency,
        interval: recurringInvoices.interval,
        startDate: recurringInvoices.startDate,
        nextRunDate: recurringInvoices.nextRunDate,
        generatedCount: recurringInvoices.generatedCount,
        totalPaise: recurringInvoices.totalPaise,
        status: recurringInvoices.status,
        autoIssue: recurringInvoices.autoIssue,
      })
      .from(recurringInvoices)
      .innerJoin(customers, join)
      .where(filter)
      .orderBy(sql`${recurringInvoices.status} = 'ended'`, asc(recurringInvoices.nextRunDate), asc(recurringInvoices.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return paged(
      rows.map((r) => ({ ...r, schedule: describeSchedule(r.frequency as Frequency, r.interval, r.startDate) })),
      total,
      { q: q.q, status: "all", page: q.page, pageSize: q.pageSize },
    );
  });
}

/* ---------------- Writing ---------------- */

/** "Make recurring" from an invoice (draft or issued): its customer and items become the template. */
export async function createRecurring(organizationId: string, userId: string, invoiceId: string, v: ScheduleValues) {
  const today = todayInIndia();
  if (v.startDate < today) invalid({ startDate: "Start today or later. Past invoices aren't created." });
  const doc = await sourceInvoice(organizationId, invoiceId);
  const template = templateFrom(valuesFromStored(doc));
  return withTenant(organizationId, async (tx) => {
    const next = nextAfter(v, null, 0, today);
    if (!next) invalid({ endDate: "With these dates no invoice would ever be created." });
    const [row] = await tx
      .insert(recurringInvoices)
      .values({
        organizationId,
        name: v.name,
        customerId: doc.partyId,
        template,
        totalPaise: doc.totalPaise,
        frequency: v.frequency,
        interval: v.interval,
        startDate: v.startDate,
        endDate: v.endDate,
        maxCount: v.maxCount,
        nextRunDate: next,
        dueDays: v.dueDays,
        autoIssue: v.autoIssue,
        autoEmail: v.autoEmail,
        sourceInvoiceId: invoiceId,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning({ id: recurringInvoices.id });
    return detail(tx, organizationId, row.id);
  });
}

/** Changes the schedule or options. The next date is recomputed and never falls in the past. */
export async function updateRecurring(organizationId: string, userId: string, id: string, v: ScheduleValues) {
  return withTenant(organizationId, async (tx) => {
    const p = await readProfile(tx, organizationId, id, true);
    if (p.status === "ended") conflict("ENDED", "This recurring invoice has ended. Create a new one instead.");
    const today = todayInIndia();
    if (v.startDate !== p.startDate && v.startDate < today && p.generatedCount === 0) invalid({ startDate: "Start today or later." });
    const next = nextAfter(v, p.lastRunDate, p.generatedCount, today);
    await tx
      .update(recurringInvoices)
      .set({
        name: v.name,
        frequency: v.frequency,
        interval: v.interval,
        startDate: v.startDate,
        endDate: v.endDate,
        maxCount: v.maxCount,
        dueDays: v.dueDays,
        autoIssue: v.autoIssue,
        autoEmail: v.autoEmail,
        nextRunDate: next,
        status: next ? p.status : "ended",
        updatedBy: userId,
      })
      .where(and(eq(recurringInvoices.organizationId, organizationId), eq(recurringInvoices.id, id)));
    return detail(tx, organizationId, id);
  });
}

/** Pause, resume (skipping dates missed while paused) or end. */
export async function setRecurringStatus(organizationId: string, userId: string, id: string, action: "pause" | "resume" | "end") {
  return withTenant(organizationId, async (tx) => {
    const p = await readProfile(tx, organizationId, id, true);
    if (p.status === "ended") conflict("ENDED", "This recurring invoice has already ended.");
    let set: Partial<Profile>;
    if (action === "pause") set = { status: "paused" };
    else if (action === "end") set = { status: "ended", nextRunDate: null };
    else {
      const next = nextAfter(scheduleOf(p), p.lastRunDate, p.generatedCount, todayInIndia());
      set = next ? { status: "active", nextRunDate: next } : { status: "ended", nextRunDate: null };
    }
    await tx.update(recurringInvoices).set({ ...set, updatedBy: userId }).where(and(eq(recurringInvoices.organizationId, organizationId), eq(recurringInvoices.id, id)));
    return detail(tx, organizationId, id);
  });
}

/** Replaces the items (and discounts, notes…) with another invoice's, for the same customer. */
export async function replaceTemplate(organizationId: string, userId: string, id: string, invoiceId: string) {
  const doc = await sourceInvoice(organizationId, invoiceId);
  return withTenant(organizationId, async (tx) => {
    const p = await readProfile(tx, organizationId, id, true);
    if (doc.partyId !== p.customerId) invalid({ invoiceId: "Choose an invoice for the same customer." });
    await tx
      .update(recurringInvoices)
      .set({ template: templateFrom(valuesFromStored(doc)), totalPaise: doc.totalPaise, sourceInvoiceId: invoiceId, updatedBy: userId })
      .where(and(eq(recurringInvoices.organizationId, organizationId), eq(recurringInvoices.id, id)));
    return detail(tx, organizationId, id);
  });
}

/* ---------------- Running ---------------- */

export type RunResult = { runDate: string; invoiceId: string | null; status: "created" | "issued" | "emailed" | "failed"; error: string | null };

async function setRun(organizationId: string, id: string, status: RunResult["status"], error: string | null) {
  await withTenant(organizationId, (tx) =>
    tx.update(recurringInvoiceRuns).set({ status, error, updatedAt: new Date() }).where(and(eq(recurringInvoiceRuns.organizationId, organizationId), eq(recurringInvoiceRuns.id, id))),
  );
}

/**
 * Creates the invoice for the schedule's next date (dated `issueDate`, the
 * scheduled date unless run early), then issues and emails it if set to.
 * Returns null when there's nothing to do (paused, ended, or another run
 * already handled this date).
 */
export async function generateNext(organizationId: string, userId: string | null, id: string, opts: { issueDate?: string; requireDue?: string } = {}): Promise<RunResult | null> {
  // 1. One transaction: lock, create the draft, log the run, move the schedule.
  let created: { runId: string; runDate: string; invoiceId: string; profile: Profile } | null = null;
  let failure: { runDate: string; error: string } | null = null;
  try {
    created = await withTenant(organizationId, async (tx) => {
      const p = await readProfile(tx, organizationId, id, true);
      if (p.status !== "active" || !p.nextRunDate) return null;
      if (opts.requireDue && p.nextRunDate > opts.requireDue) return null;
      const runDate = p.nextRunDate;
      const issueDate = opts.issueDate ?? runDate;
      const template = p.template as Template;
      const values: DocumentValues = {
        ...template,
        partyId: p.customerId,
        issueDate,
        extraDate: p.dueDays === null ? null : addDays(issueDate, p.dueDays),
        sourceId: null,
        reason: null,
        partyReference: null,
      };
      const doc = await createDraftIn(tx, organizationId, userId, "invoices", values, { recurringInvoiceId: p.id });
      const [run] = await tx
        .insert(recurringInvoiceRuns)
        .values({ organizationId, recurringInvoiceId: p.id, runDate, invoiceId: doc.id, status: "created", createdBy: userId, updatedBy: userId })
        .returning({ id: recurringInvoiceRuns.id });
      await advance(tx, organizationId, p, runDate, userId);
      return { runId: run.id, runDate, invoiceId: doc.id, profile: p };
    });
  } catch (e) {
    // Unexpected (database down…): nothing was saved; the next run retries this date.
    if (!(e as { body?: unknown }).body) throw e;
    // A business rule refused it (customer archived, product removed, closed period…): log it and move on, so it doesn't fail every run.
    failure = await withTenant(organizationId, async (tx) => {
      const p = await readProfile(tx, organizationId, id, true);
      if (p.status !== "active" || !p.nextRunDate || (opts.requireDue && p.nextRunDate > opts.requireDue)) return null;
      const message = reason(e);
      const inserted = await tx
        .insert(recurringInvoiceRuns)
        .values({ organizationId, recurringInvoiceId: p.id, runDate: p.nextRunDate, status: "failed", error: `Couldn't create the invoice: ${message}`.slice(0, 500), createdBy: userId, updatedBy: userId })
        .onConflictDoNothing()
        .returning({ id: recurringInvoiceRuns.id });
      if (!inserted.length) return null;
      await advance(tx, organizationId, p, p.nextRunDate, userId, false);
      return { runDate: p.nextRunDate, error: message };
    });
    if (failure) return { runDate: failure.runDate, invoiceId: null, status: "failed", error: failure.error };
    return null;
  }
  if (!created) return null;

  // 2. Issue (counts towards the plan's monthly invoice cap) and email, outside the creating transaction.
  const { runId, runDate, invoiceId, profile } = created;
  if (!profile.autoIssue) return { runDate, invoiceId, status: "created", error: null };
  try {
    const entitlements = await getEntitlements(organizationId);
    await issueDocument(organizationId, userId as string, "invoices", invoiceId, (tx) => assertInvoiceQuota(organizationId, entitlements, tx));
  } catch (e) {
    const error = `Saved as a draft; issuing failed: ${reason(e)}`.slice(0, 500);
    await setRun(organizationId, runId, "failed", error);
    return { runDate, invoiceId, status: "failed", error };
  }
  if (!profile.autoEmail) {
    await setRun(organizationId, runId, "issued", null);
    return { runDate, invoiceId, status: "issued", error: null };
  }
  const email = await withTenant(organizationId, async (tx) => {
    const [c] = await tx.select({ email: customers.email }).from(customers).where(and(eq(customers.organizationId, organizationId), eq(customers.id, profile.customerId)));
    return c?.email ?? null;
  });
  if (!email) {
    const error = "Issued; not emailed because the customer has no email address.";
    await setRun(organizationId, runId, "issued", error);
    return { runDate, invoiceId, status: "issued", error };
  }
  try {
    await sendDocumentEmail(organizationId, userId as string, "invoices", invoiceId, { to: [email], cc: [], subject: null, message: null, attachPdf: true });
    await setRun(organizationId, runId, "emailed", null);
    return { runDate, invoiceId, status: "emailed", error: null };
  } catch (e) {
    const error = `Issued; the email failed: ${reason(e)}`.slice(0, 500);
    await setRun(organizationId, runId, "issued", error);
    return { runDate, invoiceId, status: "issued", error };
  }
}

async function advance(tx: TenantTx, organizationId: string, p: Profile, runDate: string, userId: string | null, counted = true) {
  const generated = p.generatedCount + (counted ? 1 : 0);
  const next = nextAfter(scheduleOf(p), runDate, generated);
  await tx
    .update(recurringInvoices)
    .set({ generatedCount: generated, lastRunDate: runDate, nextRunDate: next, status: next ? p.status : "ended", updatedBy: userId })
    .where(and(eq(recurringInvoices.organizationId, organizationId), eq(recurringInvoices.id, p.id)));
}

/** "Create the next invoice now": the next scheduled invoice, dated today; the schedule moves on. */
export async function runNow(organizationId: string, userId: string, id: string) {
  const p = await withTenant(organizationId, (tx) => readProfile(tx, organizationId, id));
  if (p.status !== "active") conflict("NOT_ACTIVE", p.status === "paused" ? "Resume it first." : "This recurring invoice has ended.");
  const r = await generateNext(organizationId, userId, id, { issueDate: todayInIndia() });
  if (!r) conflict("NOTHING_DUE", "There's no next invoice to create.");
  return { run: r, recurring: await getRecurring(organizationId, id) };
}

export type RecurringRun = { organizations: number; created: number; issued: number; failed: number };

/** One company's due recurring invoices, catching up missed dates (at most 12 per schedule per run). */
export async function runCompanyRecurring(organizationId: string, now = new Date()): Promise<Omit<RecurringRun, "organizations">> {
  const result = { created: 0, issued: 0, failed: 0 };
  const today = todayInIndia(now);
  const due = await withTenant(organizationId, (tx) =>
    tx
      .select({ id: recurringInvoices.id })
      .from(recurringInvoices)
      .where(and(eq(recurringInvoices.organizationId, organizationId), eq(recurringInvoices.status, "active"), lte(recurringInvoices.nextRunDate, today))),
  );
  if (!due.length) return result;
  if ((await getEntitlements(organizationId)).access.state === "read_only") return result;
  for (const { id } of due) {
    for (let i = 0; i < MAX_CATCH_UP; i++) {
      let r: RunResult | null;
      try {
        r = await generateNext(organizationId, null, id, { requireDue: today });
      } catch (e) {
        console.error("Recurring invoice run failed; will retry", { organizationId, id, error: (e as Error).message });
        result.failed++;
        break;
      }
      if (!r) break;
      if (r.status === "failed") result.failed++;
      else {
        result.created++;
        if (r.status !== "created") result.issued++;
      }
    }
  }
  return result;
}

/** Every company's due recurring invoices (the scheduled job). Safe to run often and twice at once. */
export async function runRecurring(now = new Date()): Promise<RecurringRun> {
  const total: RecurringRun = { organizations: 0, created: 0, issued: 0, failed: 0 };
  const orgs = await db.select({ id: organization.id }).from(organization);
  for (const o of orgs) {
    const r = await runCompanyRecurring(o.id, now);
    if (r.created || r.failed) total.organizations++;
    total.created += r.created;
    total.issued += r.issued;
    total.failed += r.failed;
  }
  return total;
}
