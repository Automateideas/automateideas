import { conflict } from "../records";
import { defaultFrom, emailClient } from "@/lib/email";

// Sends customer emails for a company (invoices, receipts, reminders).
//
// EMAIL_DELIVERY=log records them without sending (development and tests);
// without RESEND_API_KEY, sending is refused with EMAIL_NOT_CONFIGURED.
// The sender shows the company's name; replies go to the company's email.

export type OutgoingEmail = {
  fromName: string;
  replyTo?: string | null;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
};

export type EmailMode = "send" | "log" | "off";
export const emailMode = (): EmailMode => (process.env.EMAIL_DELIVERY === "log" ? "log" : process.env.RESEND_API_KEY ? "send" : "off");

/** "Shah Traders via Automate Ideas <no-reply@…>" from EMAIL_FROM's address. Strips characters that could break the header. */
export function senderFor(companyName: string) {
  const from = defaultFrom();
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const name = companyName.replace(/[<>"\r\n,;]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Automate Ideas";
  return `${name} via Automate Ideas <${address}>`;
}

export async function deliver(e: OutgoingEmail): Promise<{ status: "sent" | "logged"; id: string | null }> {
  const mode = emailMode();
  if (mode === "off") conflict("EMAIL_NOT_CONFIGURED", "Email isn't set up on this server yet (RESEND_API_KEY). Ask your administrator.");
  if (mode === "log") {
    console.info(`[billing-email] to=${e.to.join(",")} subject="${e.subject}" attachments=${(e.attachments ?? []).map((a) => a.filename).join(",")}`);
    return { status: "logged", id: null };
  }
  const { data, error } = await emailClient().emails.send({
    from: senderFor(e.fromName),
    to: e.to,
    ...(e.cc?.length ? { cc: e.cc } : {}),
    ...(e.replyTo ? { replyTo: e.replyTo } : {}),
    subject: e.subject,
    text: e.text,
    html: e.html,
    ...(e.attachments?.length ? { attachments: e.attachments.map((a) => ({ filename: a.filename, content: a.content })) } : {}),
  });
  if (error) throw new Error(error.message);
  return { status: "sent", id: data?.id ?? null };
}
