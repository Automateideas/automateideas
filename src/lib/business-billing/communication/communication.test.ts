import { describe, expect, it } from "vitest";

import { senderFor } from "./email";
import { validateSend } from "./service";
import { DEFAULT_COMMUNICATION, type ReminderSettings, readCommunication, reminderDue, validateCommunication } from "./settings";
import { documentEmail, reminderEmail, whatsappNumber, whatsappText } from "./templates";

const S: ReminderSettings = { enabled: true, beforeDays: 3, onDueDate: true, afterEveryDays: 7, maxAfter: 3, sendHour: 9, viaEmail: true, viaWhatsApp: false };
const none = new Set<string>();
const due = "2026-11-20";
const at = (today: string, sent: string[] = [], hour = 10, s = S) => reminderDue(due, today, hour, s, new Set(sent))?.key ?? null;

describe("reminder schedule", () => {
  it("before, on, and every 7 days after the due date, up to 3 times", () => {
    expect(at("2026-11-16")).toBeNull(); // 4 days before
    expect(at("2026-11-17")).toBe("before");
    expect(at("2026-11-19", ["before"])).toBeNull();
    expect(at("2026-11-20", ["before"])).toBe("due");
    expect(at("2026-11-26", ["before", "due"])).toBeNull();
    expect(at("2026-11-27", ["before", "due"])).toBe("after-1");
    expect(at("2026-12-04", ["before", "due", "after-1"])).toBe("after-2");
    expect(at("2026-12-11", ["before", "due", "after-1", "after-2"])).toBe("after-3");
    expect(at("2027-01-20", ["before", "due", "after-1", "after-2", "after-3"])).toBeNull();
  });

  it("catches up after a missed day, sending only the latest stage", () => {
    expect(at("2026-11-29", [])).toBe("after-1"); // never sent anything: only the overdue one, not "before"
    expect(at("2026-12-20", ["after-1"])).toBe("after-3"); // capped at maxAfter
  });

  it("waits for the send hour, and does nothing when off", () => {
    expect(at("2026-11-17", [], 8)).toBeNull();
    expect(at("2026-11-17", [], 9)).toBe("before");
    expect(reminderDue(due, "2026-11-17", 12, { ...S, enabled: false }, none)).toBeNull();
  });

  it("respects stages switched off", () => {
    const onlyAfter = { ...S, beforeDays: null, onDueDate: false };
    expect(at("2026-11-17", [], 10, onlyAfter)).toBeNull();
    expect(at("2026-11-20", [], 10, onlyAfter)).toBeNull();
    expect(at("2026-11-27", [], 10, onlyAfter)).toBe("after-1");
    const noAfter = { ...S, afterEveryDays: null };
    expect(at("2026-12-30", [], 10, noAfter)).toBe("due");
    expect(reminderDue(due, "2026-11-25", 10, noAfter, new Set(["due"]))).toBeNull();
  });
});

describe("settings", () => {
  it("reads stored JSON with defaults for anything missing or odd", () => {
    expect(readCommunication({})).toEqual(DEFAULT_COMMUNICATION);
    expect(readCommunication({ reminders: { enabled: true, beforeDays: null, sendHour: 99 } }).reminders).toMatchObject({ enabled: true, beforeDays: null, sendHour: 9 });
  });

  it("validates", () => {
    const ok = validateCommunication({ reminders: { enabled: true, beforeDays: "2", onDueDate: false, afterEveryDays: "", maxAfter: "3", sendHour: "10" }, autoReceiptEmail: true });
    expect(ok).toEqual({ ok: true, values: { reminders: { enabled: true, beforeDays: 2, onDueDate: false, afterEveryDays: null, maxAfter: 3, sendHour: 10, viaEmail: true, viaWhatsApp: false }, autoReceiptEmail: true, autoReceiptWhatsApp: false, whatsappShared: false } });
    const nothing = validateCommunication({ reminders: { enabled: true, beforeDays: "", onDueDate: false, afterEveryDays: "", maxAfter: 3, sendHour: 9 } });
    expect(!nothing.ok && nothing.errors["reminders.enabled"]).toMatch(/at least one/);
    const bad = validateCommunication({ reminders: { enabled: false, beforeDays: "45", maxAfter: 3, sendHour: 9 } });
    expect(!bad.ok && Object.keys(bad.errors)).toEqual(["reminders.beforeDays"]);
  });
});

describe("sending", () => {
  it("validates addresses (comma lists, at most 5, de-duplicated)", () => {
    expect(validateSend({ to: "A@x.com, b@y.in; a@x.com" })).toEqual({ ok: true, values: { to: ["a@x.com", "b@y.in"], cc: [], subject: null, message: null, attachPdf: true } });
    expect(validateSend({ to: [] }).ok).toBe(false);
    const bad = validateSend({ to: ["ok@x.com", "not an email"] });
    expect(!bad.ok && bad.errors.to).toMatch(/not/);
    expect(validateSend({ to: ["1@a.co", "2@a.co", "3@a.co", "4@a.co", "5@a.co", "6@a.co"] }).ok).toBe(false);
  });

  it("escapes HTML in names and messages", () => {
    const e = documentEmail({ company: { name: "A&B <Traders>", email: null, phone: null }, label: "Invoice", number: "INV/1", message: "Hi <script>alert(1)</script>", link: "https://x/share/abc" });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("A&#38;B &#60;Traders&#62;");
    expect(e.subject).toBe("Invoice INV/1 from A&B <Traders>");
  });

  it("reminder wording follows the stage", () => {
    const base = { company: { name: "Co", email: null, phone: null }, partyName: "Ravi", number: "INV/9", balancePaise: 118000, dueDate: "2026-11-20", link: "https://x" };
    expect(reminderEmail({ ...base, daysLate: -3, kind: "before" }).subject).toMatch(/is due on 20 November 2026/);
    expect(reminderEmail({ ...base, daysLate: 0, kind: "due" }).subject).toBe("Invoice INV/9 is due today");
    expect(reminderEmail({ ...base, daysLate: 8, kind: "after" }).subject).toBe("Overdue: invoice INV/9 (8 days late)");
    expect(reminderEmail({ ...base, daysLate: 8, kind: "after" }).text).toContain("₹1,180.00");
  });

  it("sender name: the company, via Automate Ideas, without header tricks", () => {
    expect(senderFor("Shah <Traders>, Pune\r\nBcc: x")).toMatch(/^Shah Traders Pune Bcc: x via Automate Ideas <.+>$/);
  });
});

describe("WhatsApp", () => {
  it("normalises Indian numbers for wa.me", () => {
    expect(whatsappNumber("98765 43210")).toBe("919876543210");
    expect(whatsappNumber("+91-98765-43210")).toBe("919876543210");
    expect(whatsappNumber("09876543210")).toBe("919876543210");
    expect(whatsappNumber("0044 20 7946 0958")).toBe("442079460958");
    expect(whatsappNumber("12345")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });

  it("message carries the link", () => {
    expect(whatsappText({ company: "Co", partyName: "Ravi", label: "Invoice", number: "INV/1", amountPaise: 50000, link: "https://x/share/t" })).toBe("Dear Ravi, here is invoice INV/1 for ₹500.00 from Co: https://x/share/t");
  });
});
