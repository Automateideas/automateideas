import { FieldReader, type FieldErrors } from "../fields";

// A company's email and reminder settings (billing_settings.communication).
// Pure: the settings page checks with it and the API checks again.

export type ReminderSettings = {
  /** Send reminders automatically for unpaid invoices. */
  enabled: boolean;
  /** Days before the due date for a friendly heads-up; null = none. */
  beforeDays: number | null;
  /** On the due date itself. */
  onDueDate: boolean;
  /** Once overdue, repeat every N days; null = no overdue reminders. */
  afterEveryDays: number | null;
  /** At most this many overdue reminders per invoice. */
  maxAfter: number;
  /** Not before this hour of the day (India time, 0–23). */
  sendHour: number;
  /** Channels: email (to customers with an email) and WhatsApp (to customers with a phone number). */
  viaEmail: boolean;
  viaWhatsApp: boolean;
};

export type CommunicationSettings = {
  reminders: ReminderSettings;
  /** Email a receipt to the customer when a payment is recorded (if they have an email). */
  autoReceiptEmail: boolean;
  /** Send the receipt on WhatsApp too (if they have a phone number and WhatsApp is set up). */
  autoReceiptWhatsApp: boolean;
  /** Send WhatsApp messages from the shared Automate Ideas number (option A) when the company hasn't connected its own. */
  whatsappShared: boolean;
};

export const DEFAULT_COMMUNICATION: CommunicationSettings = {
  reminders: { enabled: false, beforeDays: 3, onDueDate: true, afterEveryDays: 7, maxAfter: 3, sendHour: 9, viaEmail: true, viaWhatsApp: false },
  autoReceiptEmail: false,
  autoReceiptWhatsApp: false,
  whatsappShared: false,
};

const int = (v: unknown, min: number, max: number, fallback: number | null) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback);

/** Stored JSON → settings, falling back to defaults for anything missing or odd. */
export function readCommunication(json: unknown): CommunicationSettings {
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const r = o.reminders && typeof o.reminders === "object" ? (o.reminders as Record<string, unknown>) : {};
  const d = DEFAULT_COMMUNICATION.reminders;
  return {
    reminders: {
      enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
      beforeDays: r.beforeDays === null ? null : int(r.beforeDays, 1, 30, d.beforeDays),
      onDueDate: typeof r.onDueDate === "boolean" ? r.onDueDate : d.onDueDate,
      afterEveryDays: r.afterEveryDays === null ? null : int(r.afterEveryDays, 1, 60, d.afterEveryDays),
      maxAfter: int(r.maxAfter, 1, 10, d.maxAfter)!,
      sendHour: int(r.sendHour, 0, 23, d.sendHour)!,
      viaEmail: typeof r.viaEmail === "boolean" ? r.viaEmail : d.viaEmail,
      viaWhatsApp: typeof r.viaWhatsApp === "boolean" ? r.viaWhatsApp : d.viaWhatsApp,
    },
    autoReceiptEmail: typeof o.autoReceiptEmail === "boolean" ? o.autoReceiptEmail : DEFAULT_COMMUNICATION.autoReceiptEmail,
    autoReceiptWhatsApp: typeof o.autoReceiptWhatsApp === "boolean" ? o.autoReceiptWhatsApp : DEFAULT_COMMUNICATION.autoReceiptWhatsApp,
    whatsappShared: typeof o.whatsappShared === "boolean" ? o.whatsappShared : DEFAULT_COMMUNICATION.whatsappShared,
  };
}

/** { reminders: { enabled, beforeDays, onDueDate, afterEveryDays, maxAfter, sendHour, viaEmail, viaWhatsApp }, autoReceiptEmail, autoReceiptWhatsApp, whatsappShared } */
export function validateCommunication(raw: Record<string, unknown>): { ok: true; values: CommunicationSettings } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const rem = raw.reminders && typeof raw.reminders === "object" ? (raw.reminders as Record<string, unknown>) : {};
  const r = new FieldReader(rem);
  const enabled = r.bool("enabled", false);
  const beforeDays = r.int("beforeDays", 1, 30, "Enter 1 to 30 days, or leave blank for none.");
  const onDueDate = r.bool("onDueDate", true);
  const afterEveryDays = r.int("afterEveryDays", 1, 60, "Enter 1 to 60 days, or leave blank for none.");
  const maxAfter = r.int("maxAfter", 1, 10, "Enter 1 to 10.", true);
  const sendHour = r.int("sendHour", 0, 23, "Choose an hour.", true);
  const viaEmail = r.bool("viaEmail", true);
  const viaWhatsApp = r.bool("viaWhatsApp", false);
  for (const [k, v] of Object.entries(r.errors)) errors[`reminders.${k}`] = v;
  if (enabled && beforeDays === null && !onDueDate && afterEveryDays === null && !Object.keys(errors).length) {
    errors["reminders.enabled"] = "Choose at least one: before the due date, on it, or after it.";
  }
  if (enabled && !viaEmail && !viaWhatsApp && !errors["reminders.enabled"]) errors["reminders.viaEmail"] = "Choose email, WhatsApp or both.";
  const top = new FieldReader(raw);
  const autoReceiptEmail = top.bool("autoReceiptEmail", false);
  const autoReceiptWhatsApp = top.bool("autoReceiptWhatsApp", false);
  const whatsappShared = top.bool("whatsappShared", false);
  Object.assign(errors, top.errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { reminders: { enabled, beforeDays, onDueDate, afterEveryDays, maxAfter: maxAfter!, sendHour: sendHour!, viaEmail, viaWhatsApp }, autoReceiptEmail, autoReceiptWhatsApp, whatsappShared } };
}

/* ---------------- Which reminder is due ---------------- */

const DAY = 86_400_000;
const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;

export type ReminderStage = { key: string; kind: "before" | "due" | "after"; daysLate: number };

/**
 * The reminder an unpaid invoice should get today, or null. Picks the latest
 * stage already reached (so a run that was missed yesterday still catches
 * up) and skips it if that stage was already sent (`sent` holds stage keys).
 *
 *   before:  from (due − beforeDays) until the due date
 *   due:     from the due date until the first overdue reminder
 *   after-n: from due + n × afterEveryDays, for n = 1 … maxAfter
 */
export function reminderDue(dueDate: string, today: string, hourIst: number, s: ReminderSettings, sent: ReadonlySet<string>): ReminderStage | null {
  if (!s.enabled || hourIst < s.sendHour) return null;
  const late = dayNumber(today) - dayNumber(dueDate);
  let stage: ReminderStage | null = null;
  if (s.beforeDays !== null && late < 0 && -late <= s.beforeDays) stage = { key: "before", kind: "before", daysLate: late };
  if (s.onDueDate && late >= 0) stage = { key: "due", kind: "due", daysLate: late };
  if (s.afterEveryDays !== null && late >= s.afterEveryDays) {
    const n = Math.min(Math.floor(late / s.afterEveryDays), s.maxAfter);
    stage = { key: `after-${n}`, kind: "after", daysLate: late };
  }
  if (!stage || sent.has(stage.key)) return null;
  return stage;
}

/** Documents that can be emailed or shared with the customer (or supplier, for purchase orders). */
export const SENDABLE_DOCUMENTS = ["invoices", "quotations", "sales-orders", "credit-notes", "debit-notes", "purchase-orders"] as const;
