// Customer email wording. Pure: every value is escaped for HTML here.

export type Company = { name: string; email: string | null; phone: string | null };
export type Rendered = { subject: string; text: string; html: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const inr = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const day = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

function layout(company: Company, bodyHtml: string, link: { url: string; label: string } | null) {
  const contact = [company.email, company.phone].filter(Boolean).map((v) => esc(v!)).join(" · ");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
<tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:bold">${esc(company.name)}</td></tr>
<tr><td style="padding:8px 28px 8px;font-size:15px;line-height:1.55">${bodyHtml}</td></tr>
${link ? `<tr><td style="padding:12px 28px 24px"><a href="${esc(link.url)}" style="display:inline-block;background:#04875a;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold">${esc(link.label)}</a></td></tr>` : ""}
<tr><td style="padding:14px 28px 22px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">${contact ? `${contact}<br>` : ""}Sent by ${esc(company.name)} using Automate Ideas.</td></tr>
</table></body></html>`;
}

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

/** The default message for sending a document (the user can edit it before sending). */
export function defaultDocumentMessage(input: { company: Company; partyName: string; label: string; number: string; totalPaise: number; dueDate: string | null }) {
  const due = input.dueDate ? ` It is due on ${day(input.dueDate)}.` : "";
  return `Dear ${input.partyName},\n\nPlease find ${input.label.toLowerCase()} ${input.number} for ${inr(input.totalPaise)} attached.${due}\n\nThank you for your business.\n${input.company.name}`;
}

export function documentEmail(input: { company: Company; label: string; number: string; message: string; link: string }): Rendered {
  return {
    subject: `${input.label} ${input.number} from ${input.company.name}`,
    text: `${input.message}\n\nView or download: ${input.link}`,
    html: layout(input.company, paragraphs(input.message), { url: input.link, label: `View ${input.label.toLowerCase()}` }),
  };
}

export function receiptEmail(input: { company: Company; partyName: string; number: string; amountPaise: number; date: string; message: string | null; link: string }): Rendered {
  const message = input.message ?? `Dear ${input.partyName},\n\nThank you. We received your payment of ${inr(input.amountPaise)} on ${day(input.date)}. The receipt (${input.number}) is attached.\n\n${input.company.name}`;
  return {
    subject: `Payment received: ${inr(input.amountPaise)} (receipt ${input.number})`,
    text: `${message}\n\nView or download: ${input.link}`,
    html: layout(input.company, paragraphs(message), { url: input.link, label: "View receipt" }),
  };
}

export type ReminderKind = "before" | "due" | "after" | "manual";

export function reminderEmail(input: { company: Company; partyName: string; number: string; balancePaise: number; dueDate: string; daysLate: number; kind: ReminderKind; link: string }): Rendered {
  const amount = inr(input.balancePaise);
  const late = input.daysLate;
  const subject =
    late < 0
      ? `Reminder: invoice ${input.number} is due on ${day(input.dueDate)}`
      : late === 0
        ? `Invoice ${input.number} is due today`
        : `Overdue: invoice ${input.number} (${late} day${late === 1 ? "" : "s"} late)`;
  const lead =
    late < 0
      ? `This is a friendly reminder that invoice ${input.number} for ${amount} is due on ${day(input.dueDate)}.`
      : late === 0
        ? `Invoice ${input.number} for ${amount} is due today.`
        : `Invoice ${input.number} was due on ${day(input.dueDate)} and ${amount} is still outstanding.`;
  const message = `Dear ${input.partyName},\n\n${lead} If you've already paid, please ignore this message, and thank you.\n\n${input.company.name}`;
  return {
    subject,
    text: `${message}\n\nView the invoice: ${input.link}`,
    html: layout(input.company, paragraphs(message), { url: input.link, label: "View invoice" }),
  };
}

/** WhatsApp message text with the share link (sent from the user's own WhatsApp). */
export function whatsappText(input: { company: string; partyName: string; label: string; number: string; amountPaise: number; link: string }) {
  return `Dear ${input.partyName}, here is ${input.label.toLowerCase()} ${input.number} for ${inr(input.amountPaise)} from ${input.company}: ${input.link}`;
}

/** Digits for wa.me: 10-digit Indian numbers get 91 in front; null when it doesn't look like a phone number. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
