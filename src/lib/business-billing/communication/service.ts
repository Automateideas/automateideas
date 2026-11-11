import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { billingMessages, billingSettings, customers, organization, suppliers } from "@/db/schema";
import { getEntitlements } from "@/lib/subscription-billing/entitlements";

import { getDocument } from "../documents/service";
import { DOCUMENT_TYPES, type DocumentSlug, todayInIndia } from "../documents/types";
import { FieldReader, type FieldErrors } from "../fields";
import { openInvoices } from "../payments/balances";
import { getPayment } from "../payments/service";
import { documentPdf, receiptPdf } from "../pdf/service";
import { conflict, invalid } from "../records";
import { getBillingSettings } from "../settings";
import { type TenantTx, withTenant } from "../tenant-db";
import { deliver, emailMode } from "./email";
import { type CommunicationSettings, SENDABLE_DOCUMENTS, readCommunication, reminderDue } from "./settings";
import { createShare } from "./shares";
import { type Company, type Rendered, defaultDocumentMessage, documentEmail, receiptEmail, reminderEmail, whatsappNumber, whatsappText } from "./templates";

// Sending documents to customers: email (with the PDF attached and a link),
// WhatsApp share links, payment receipts and payment reminders. Every send is
// logged in billing_messages and shown on the document.

/** Documents that can be sent to the customer or supplier they're addressed to. */
export const SENDABLE: readonly DocumentSlug[] = SENDABLE_DOCUMENTS;
export const isSendable = (slug: string): slug is DocumentSlug => (SENDABLE as readonly string[]).includes(slug);

async function companyOf(organizationId: string): Promise<Company> {
  const s = await getBillingSettings(organizationId);
  return { name: (s.configured ? s.tradeName : null) ?? s.legalName, email: s.email ?? null, phone: s.phone ?? null };
}

async function contactOf(tx: TenantTx, organizationId: string, kind: "customer" | "supplier", id: string) {
  const t = kind === "customer" ? customers : suppliers;
  const [c] = await tx.select({ name: t.name, email: t.email, phone: t.phone }).from(t).where(and(eq(t.organizationId, organizationId), eq(t.id, id)));
  return c ?? null;
}

export async function communicationSettings(organizationId: string): Promise<CommunicationSettings & { configured: boolean }> {
  return withTenant(organizationId, async (tx) => {
    const [s] = await tx.select({ c: billingSettings.communication }).from(billingSettings).where(eq(billingSettings.organizationId, organizationId));
    return { ...readCommunication(s?.c), configured: !!s };
  });
}

export async function setCommunicationSettings(organizationId: string, userId: string, v: CommunicationSettings) {
  await withTenant(organizationId, async (tx) => {
    const done = await tx
      .update(billingSettings)
      .set({ communication: v, updatedBy: userId, updatedAt: new Date() })
      .where(eq(billingSettings.organizationId, organizationId))
      .returning({ id: billingSettings.organizationId });
    if (!done.length) conflict("NOT_SET_UP", "Save your company details first.");
  });
  return communicationSettings(organizationId);
}

/* ---------------- Input ---------------- */

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
export type SendInput = { to: string[]; cc: string[]; subject: string | null; message: string | null; attachPdf: boolean };

function readAddresses(raw: unknown, key: string, errors: FieldErrors, required: boolean) {
  const list = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;\s]+/) : [])
    .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
    .filter(Boolean);
  if (required && !list.length) errors[key] = "Enter at least one email address.";
  else if (list.length > 5) errors[key] = "Send to at most 5 addresses.";
  else if (list.some((e) => !EMAIL_RE.test(e) || e.length > 254)) errors[key] = `Check the address: ${list.find((e) => !EMAIL_RE.test(e) || e.length > 254)}`;
  return [...new Set(list)];
}

/** { to: [..] | "a@x, b@y", cc?, subject?, message?, attachPdf? } */
export function validateSend(raw: Record<string, unknown>): { ok: true; values: SendInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const to = readAddresses(raw.to, "to", errors, true);
  const cc = readAddresses(raw.cc, "cc", errors, false);
  const r = new FieldReader(raw);
  const subject = r.text("subject", 200);
  const message = r.text("message", 4000);
  const attachPdf = r.bool("attachPdf", true);
  Object.assign(errors, r.errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { to, cc, subject, message, attachPdf } };
}

/* ---------------- Logging ---------------- */

type LogInput = { channel: "email" | "whatsapp"; kind: string; documentType: string; documentId: string; customerId: string | null; recipient: string; subject: string | null; status: "sending" | "sent" | "failed" | "logged"; providerMessageId?: string | null; error?: string | null; dedupeKey?: string | null; userId: string | null };

async function logMessage(organizationId: string, m: LogInput) {
  return withTenant(organizationId, async (tx) => {
    const [row] = await tx
      .insert(billingMessages)
      .values({ organizationId, ...m, createdBy: m.userId, updatedBy: m.userId })
      .onConflictDoNothing()
      .returning({ id: billingMessages.id });
    return row?.id ?? null;
  });
}

async function finishMessage(organizationId: string, id: string, status: "sent" | "failed" | "logged", providerMessageId: string | null, error: string | null) {
  await withTenant(organizationId, (tx) =>
    tx
      .update(billingMessages)
      // A failed scheduled reminder frees its dedupe key, so the next run can try again.
      .set({ status, providerMessageId, error, ...(status === "failed" ? { dedupeKey: null } : {}), updatedAt: new Date() })
      .where(and(eq(billingMessages.organizationId, organizationId), eq(billingMessages.id, id))),
  );
}

/** Sends one email and logs it; a failure is logged too, then reported (409 EMAIL_FAILED). */
async function sendLogged(organizationId: string, e: { to: string[]; cc: string[]; company: Company; rendered: Rendered; attachment: { filename: string; content: Buffer } | null; log: Omit<LogInput, "channel" | "recipient" | "subject" | "status"> }) {
  if (emailMode() === "off") conflict("EMAIL_NOT_CONFIGURED", "Email isn't set up on this server yet (RESEND_API_KEY). Ask your administrator.");
  const id = await logMessage(organizationId, { ...e.log, channel: "email", recipient: [...e.to, ...e.cc].join(", "), subject: e.rendered.subject, status: "sending" });
  if (!id) return null; // someone else is already sending this exact reminder
  try {
    const r = await deliver({ fromName: e.company.name, replyTo: e.company.email, to: e.to, cc: e.cc, ...e.rendered, attachments: e.attachment ? [e.attachment] : [] });
    await finishMessage(organizationId, id, r.status, r.id, null);
    return { id, status: r.status };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await finishMessage(organizationId, id, "failed", null, message.slice(0, 500));
    conflict("EMAIL_FAILED", `The email couldn't be sent: ${message}`);
  }
}

/* ---------------- Documents ---------------- */

function requireSendable(slug: DocumentSlug, status: string) {
  const label = DOCUMENT_TYPES[slug].singular.toLowerCase();
  if (!isSendable(slug)) invalid({ type: `A ${label} can't be sent from here.` });
  if (status === "draft") conflict("NOT_ISSUED", `Issue the ${label} before sending it.`);
  if (status === "void") conflict("VOID", `This ${label} is void.`);
}

/** What the "Email" dialog starts with: the customer's (or supplier's) address and a ready message. */
export async function documentEmailDefaults(organizationId: string, slug: DocumentSlug, id: string) {
  const doc = await getDocument(organizationId, slug, id);
  const kind = DOCUMENT_TYPES[slug].party;
  const contact = await withTenant(organizationId, (tx) => contactOf(tx, organizationId, kind, doc.partyId));
  const company = await companyOf(organizationId);
  const label = DOCUMENT_TYPES[slug].singular;
  return {
    to: contact?.email ? [contact.email] : [],
    phone: contact?.phone ?? null,
    whatsappNumber: whatsappNumber(contact?.phone),
    subject: `${label} ${doc.number ?? ""} from ${company.name}`,
    message: defaultDocumentMessage({ company, partyName: doc.partyName ?? contact?.name ?? "", label, number: doc.number ?? "", totalPaise: doc.totalPaise, dueDate: slug === "invoices" ? doc.extraDate : null }),
    emailMode: emailMode(),
    canSend: doc.status !== "draft" && doc.status !== "void" && isSendable(slug),
  };
}

export async function sendDocumentEmail(organizationId: string, userId: string, slug: DocumentSlug, id: string, v: SendInput) {
  const doc = await getDocument(organizationId, slug, id);
  requireSendable(slug, doc.status);
  const company = await companyOf(organizationId);
  const label = DOCUMENT_TYPES[slug].singular;
  const share = await withTenant(organizationId, (tx) => createShare(tx, organizationId, userId, slug, id));
  const message = v.message ?? defaultDocumentMessage({ company, partyName: doc.partyName ?? "", label, number: doc.number ?? "", totalPaise: doc.totalPaise, dueDate: slug === "invoices" ? doc.extraDate : null });
  const rendered = documentEmail({ company, label, number: doc.number ?? "", message, link: share.url });
  if (v.subject) rendered.subject = v.subject;
  const pdf = v.attachPdf ? await documentPdf(organizationId, slug, id) : null;
  return sendLogged(organizationId, {
    to: v.to,
    cc: v.cc,
    company,
    rendered,
    attachment: pdf ? { filename: pdf.fileName, content: pdf.bytes } : null,
    log: { kind: "document", documentType: slug, documentId: id, customerId: doc.customerId, userId },
  });
}

/** A new share link plus a ready WhatsApp message; logs that it was shared on WhatsApp when asked. */
export async function shareDocument(organizationId: string, userId: string, slug: DocumentSlug, id: string, channel: "link" | "whatsapp") {
  const doc = await getDocument(organizationId, slug, id);
  requireSendable(slug, doc.status);
  const company = await companyOf(organizationId);
  const share = await withTenant(organizationId, (tx) => createShare(tx, organizationId, userId, slug, id));
  const contact = await withTenant(organizationId, (tx) => contactOf(tx, organizationId, DOCUMENT_TYPES[slug].party, doc.partyId));
  const phone = whatsappNumber(contact?.phone);
  const text = whatsappText({ company: company.name, partyName: doc.partyName ?? contact?.name ?? "", label: DOCUMENT_TYPES[slug].singular, number: doc.number ?? "", amountPaise: doc.totalPaise, link: share.url });
  if (channel === "whatsapp") {
    await logMessage(organizationId, { channel: "whatsapp", kind: "document", documentType: slug, documentId: id, customerId: doc.customerId, recipient: phone ? `+${phone}` : "(chosen in WhatsApp)", subject: null, status: "logged", userId });
  }
  return { url: share.url, expiresAt: share.expiresAt, whatsapp: { phone, text, url: `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}` } };
}

/* ---------------- Receipts ---------------- */

export async function receiptEmailDefaults(organizationId: string, paymentId: string) {
  const p = await getPayment(organizationId, paymentId);
  const contact = await withTenant(organizationId, (tx) => contactOf(tx, organizationId, "customer", p.customerId));
  return { to: contact?.email ? [contact.email] : [], whatsappNumber: whatsappNumber(contact?.phone), emailMode: emailMode(), canSend: p.status !== "void" };
}

export async function sendReceiptEmail(organizationId: string, userId: string, paymentId: string, v: SendInput) {
  const p = await getPayment(organizationId, paymentId);
  if (p.status === "void") conflict("VOID", "This payment is void.");
  const company = await companyOf(organizationId);
  const share = await withTenant(organizationId, (tx) => createShare(tx, organizationId, userId, "receipt", paymentId));
  const rendered = receiptEmail({ company, partyName: p.customerName, number: p.number ?? "", amountPaise: p.amountPaise, date: p.paymentDate, message: v.message, link: share.url });
  if (v.subject) rendered.subject = v.subject;
  const pdf = v.attachPdf ? await receiptPdf(organizationId, paymentId) : null;
  return sendLogged(organizationId, {
    to: v.to,
    cc: v.cc,
    company,
    rendered,
    attachment: pdf ? { filename: pdf.fileName, content: pdf.bytes } : null,
    log: { kind: "receipt", documentType: "receipt", documentId: paymentId, customerId: p.customerId, userId },
  });
}

/** After a payment is recorded: email the receipt if the company turned that on and the customer has an email. Never throws. */
export async function autoSendReceipt(organizationId: string, userId: string, paymentId: string) {
  try {
    const s = await communicationSettings(organizationId);
    if (!s.autoReceiptEmail || emailMode() === "off") return null;
    const d = await receiptEmailDefaults(organizationId, paymentId);
    if (!d.to.length) return null;
    return await sendReceiptEmail(organizationId, userId, paymentId, { to: d.to, cc: [], subject: null, message: null, attachPdf: true });
  } catch (e) {
    console.error("Automatic receipt email failed", { paymentId, error: (e as Error).message });
    return null;
  }
}

/* ---------------- Reminders ---------------- */

type ReminderTarget = { id: string; number: string | null; dueDate: string; balancePaise: number; customerId: string; customerName: string; email: string | null; sendReminders: boolean };

async function reminderTargets(tx: TenantTx, organizationId: string, invoiceIds?: string[]): Promise<ReminderTarget[]> {
  const open = (await openInvoices(tx, organizationId, null)).filter((b) => b.balancePaise > 0 && (!invoiceIds || invoiceIds.includes(b.id)));
  if (!open.length) return [];
  const people = await tx
    .select({ id: customers.id, name: customers.name, email: customers.email, sendReminders: customers.sendReminders })
    .from(customers)
    .where(and(eq(customers.organizationId, organizationId), inArray(customers.id, [...new Set(open.map((b) => b.customerId))])));
  const byId = new Map(people.map((c) => [c.id, c]));
  return open.map((b) => {
    const c = byId.get(b.customerId);
    return { id: b.id, number: b.number, dueDate: b.dueDate ?? b.issueDate, balancePaise: b.balancePaise, customerId: b.customerId, customerName: c?.name ?? "", email: c?.email ?? null, sendReminders: c?.sendReminders ?? false };
  });
}

async function sendReminderTo(organizationId: string, userId: string | null, t: ReminderTarget, stage: { key: string; kind: "before" | "due" | "after" | "manual"; daysLate: number }, dedupe: boolean) {
  if (!t.email) conflict("NO_EMAIL", `${t.customerName} has no email address. Add one on the customer first.`);
  const company = await companyOf(organizationId);
  const share = await withTenant(organizationId, (tx) => createShare(tx, organizationId, userId, "invoices", t.id));
  const rendered = reminderEmail({ company, partyName: t.customerName, number: t.number ?? "", balancePaise: t.balancePaise, dueDate: t.dueDate, daysLate: stage.daysLate, kind: stage.kind, link: share.url });
  return sendLogged(organizationId, {
    to: [t.email],
    cc: [],
    company,
    rendered,
    attachment: null,
    log: { kind: "reminder", documentType: "invoices", documentId: t.id, customerId: t.customerId, userId, dedupeKey: dedupe ? `reminder:${t.id}:${stage.key}` : null },
  });
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** "Send reminder now" on an unpaid invoice (ignores the schedule and the customer's opt-out). */
export async function sendReminderNow(organizationId: string, userId: string, invoiceId: string) {
  const doc = await getDocument(organizationId, "invoices", invoiceId);
  if (doc.status === "draft" || doc.status === "void") conflict("NOT_ISSUED", doc.status === "void" ? "This invoice is void." : "Issue the invoice first.");
  const [t] = await withTenant(organizationId, (tx) => reminderTargets(tx, organizationId, [invoiceId]));
  if (!t) conflict("PAID", "This invoice is fully paid; there's nothing to remind about.");
  return sendReminderTo(organizationId, userId, t, { key: "manual", kind: "manual", daysLate: daysBetween(t.dueDate, todayInIndia()) }, false);
}

export type ReminderRun = { organizations: number; checked: number; sent: number; failed: number; skipped: number };

/** One company's due reminders. */
export async function runCompanyReminders(organizationId: string, now = new Date()): Promise<Omit<ReminderRun, "organizations">> {
  const result = { checked: 0, sent: 0, failed: 0, skipped: 0 };
  const s = await communicationSettings(organizationId);
  if (!s.configured || !s.reminders.enabled) return result;
  // Read-only (expired) workspaces don't send automatic reminders.
  if ((await getEntitlements(organizationId)).access.state === "read_only") return result;
  const today = todayInIndia(now);
  const hourIst = new Date(now.getTime() + 330 * 60_000).getUTCHours();
  const { targets, sentKeys } = await withTenant(organizationId, async (tx) => {
    const targets = (await reminderTargets(tx, organizationId)).filter((t) => t.email && t.sendReminders);
    const rows = targets.length
      ? await tx
          .select({ documentId: billingMessages.documentId, dedupeKey: billingMessages.dedupeKey })
          .from(billingMessages)
          .where(and(eq(billingMessages.organizationId, organizationId), eq(billingMessages.kind, "reminder"), inArray(billingMessages.documentId, targets.map((t) => t.id)), sql`${billingMessages.dedupeKey} is not null`))
      : [];
    const sentKeys = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = sentKeys.get(r.documentId) ?? new Set<string>();
      set.add(r.dedupeKey!.split(":").at(-1)!);
      sentKeys.set(r.documentId, set);
    }
    return { targets, sentKeys };
  });
  for (const t of targets.slice(0, 500)) {
    result.checked++;
    const stage = reminderDue(t.dueDate, today, hourIst, s.reminders, sentKeys.get(t.id) ?? new Set());
    if (!stage) {
      result.skipped++;
      continue;
    }
    try {
      const r = await sendReminderTo(organizationId, null, t, stage, true);
      if (r) result.sent++;
      else result.skipped++;
    } catch {
      result.failed++;
    }
  }
  return result;
}

/** Every company's due reminders (the scheduled job). Safe to run often and twice at once. */
export async function runReminders(now = new Date()): Promise<ReminderRun> {
  const total: ReminderRun = { organizations: 0, checked: 0, sent: 0, failed: 0, skipped: 0 };
  if (emailMode() === "off") return total;
  const orgs = await db.select({ id: organization.id }).from(organization);
  for (const o of orgs) {
    const r = await runCompanyReminders(o.id, now);
    if (r.checked) total.organizations++;
    total.checked += r.checked;
    total.sent += r.sent;
    total.failed += r.failed;
    total.skipped += r.skipped;
  }
  return total;
}

/* ---------------- History ---------------- */

export async function listMessages(organizationId: string, documentType: string, documentId: string) {
  return withTenant(organizationId, (tx) =>
    tx
      .select({ id: billingMessages.id, channel: billingMessages.channel, kind: billingMessages.kind, recipient: billingMessages.recipient, subject: billingMessages.subject, status: billingMessages.status, error: billingMessages.error, createdAt: billingMessages.createdAt })
      .from(billingMessages)
      .where(and(eq(billingMessages.organizationId, organizationId), eq(billingMessages.documentType, documentType), eq(billingMessages.documentId, documentId)))
      .orderBy(desc(billingMessages.createdAt))
      .limit(50),
  );
}

/** A link to a payment receipt plus a ready WhatsApp message. */
export async function shareReceipt(organizationId: string, userId: string, paymentId: string, channel: "link" | "whatsapp") {
  const p = await getPayment(organizationId, paymentId);
  if (p.status === "void") conflict("VOID", "This payment is void.");
  const company = await companyOf(organizationId);
  const share = await withTenant(organizationId, (tx) => createShare(tx, organizationId, userId, "receipt", paymentId));
  const contact = await withTenant(organizationId, (tx) => contactOf(tx, organizationId, "customer", p.customerId));
  const phone = whatsappNumber(contact?.phone);
  const text = whatsappText({ company: company.name, partyName: p.customerName, label: "Receipt", number: p.number ?? "", amountPaise: p.amountPaise, link: share.url });
  if (channel === "whatsapp") {
    await logMessage(organizationId, { channel: "whatsapp", kind: "receipt", documentType: "receipt", documentId: paymentId, customerId: p.customerId, recipient: phone ? `+${phone}` : "(chosen in WhatsApp)", subject: null, status: "logged", userId });
  }
  return { url: share.url, expiresAt: share.expiresAt, whatsapp: { phone, text, url: `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}` } };
}
