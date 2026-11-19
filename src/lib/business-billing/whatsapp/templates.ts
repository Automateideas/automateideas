// The WhatsApp message templates Automate Ideas sends. A business can only
// message a customer first with a template Meta has approved, so these are
// created in the WhatsApp Business account (the shared one with
// `pnpm whatsapp:templates`, a company's own one when it connects).
//
// Each has a "View" button to the document's private share link
// (/share/<token>), so no PDF upload to Meta is needed. Pure.

export type TemplateKind = "document" | "reminder" | "receipt";
export const LANGUAGE = "en";

export const TEMPLATE_NAMES: Record<TemplateKind, string> = {
  document: "ai_document_v1",
  reminder: "ai_payment_reminder_v1",
  receipt: "ai_payment_receipt_v1",
};

const BODY: Record<TemplateKind, { text: string; example: string[]; button: string }> = {
  document: {
    text: "Hello {{1}}, {{2}} has sent you {{3}} {{4}} for {{5}}. Tap the button below to view or download it.",
    example: ["Ravi", "Shah Traders", "invoice", "INV/2026-27/0012", "₹11,800.00"],
    button: "View document",
  },
  reminder: {
    text: "Hello {{1}}, this is a reminder from {{2}}: invoice {{3}} for {{4}} {{5}}. If you have already paid, please ignore this message. Thank you.",
    example: ["Ravi", "Shah Traders", "INV/2026-27/0012", "₹11,800.00", "is due on 20 November 2026"],
    button: "View invoice",
  },
  receipt: {
    text: "Hello {{1}}, {{2}} has received your payment of {{3}} on {{4}}. Thank you! Your receipt {{5}} is ready.",
    example: ["Ravi", "Shah Traders", "₹11,800.00", "14 November 2026", "PAY/2026-27/0007"],
    button: "View receipt",
  },
};

/** The body for creating a template in a WhatsApp Business account (POST /{waba}/message_templates). */
export function templateDefinition(kind: TemplateKind, appUrl: string) {
  const b = BODY[kind];
  const base = appUrl.replace(/\/+$/, "");
  return {
    name: TEMPLATE_NAMES[kind],
    language: LANGUAGE,
    category: "UTILITY",
    components: [
      { type: "BODY", text: b.text, example: { body_text: [b.example] } },
      { type: "FOOTER", text: "Sent using Automate Ideas" },
      { type: "BUTTONS", buttons: [{ type: "URL", text: b.button, url: `${base}/share/{{1}}`, example: [`${base}/share/EXAMPLEtoken0000000000000000000000`] }] },
    ],
  };
}

/**
 * The "template" object for sending (POST /{phone_number_id}/messages).
 * `params` fill {{1}}… in order; `shareToken` completes the button's link.
 * WhatsApp refuses empty parameters and new lines in them, so both are cleaned.
 */
export function templateMessage(kind: TemplateKind, params: string[], shareToken: string) {
  const clean = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 1000) || "-";
  return {
    name: TEMPLATE_NAMES[kind],
    language: { code: LANGUAGE },
    components: [
      { type: "body", parameters: params.map((text) => ({ type: "text", text: clean(text) })) },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: shareToken }] },
    ],
  };
}

export const TEMPLATE_KINDS = Object.keys(TEMPLATE_NAMES) as TemplateKind[];
