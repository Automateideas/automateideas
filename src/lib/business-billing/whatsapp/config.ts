import { encryptionConfigured } from "@/lib/crypto/secret-box";

// WhatsApp settings from the server's .env. See docs/whatsapp-setup.md.
//
// Option A, the shared Automate Ideas number (one WhatsApp Business account
// sends for every company that turns it on):
//   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_WABA_ID
//
// Option B, each company connects its own number (Meta Embedded Signup):
//   META_APP_ID, META_APP_SECRET, WHATSAPP_EMBEDDED_CONFIG_ID, APP_ENCRYPTION_KEY
//
// Both: META_APP_SECRET and WHATSAPP_VERIFY_TOKEN for the delivery-status
// webhook (/api/webhooks/whatsapp).
//
// WHATSAPP_DELIVERY=log records messages without calling Meta (tests).
// WHATSAPP_GRAPH_URL points at a different Graph API host (tests use a fake one).

export const graphVersion = () => process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
export const graphBase = () => (process.env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com").replace(/\/+$/, "");
export const whatsappLogMode = () => process.env.WHATSAPP_DELIVERY === "log";

/** Messages a company may send from the shared number each calendar month (Automate Ideas pays Meta for these). */
export const platformMonthlyLimit = () => {
  const n = Number(process.env.WHATSAPP_PLATFORM_MONTHLY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 1000;
};

export function platformSender() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) return null;
  return { phoneNumberId, token, wabaId: process.env.WHATSAPP_WABA_ID ?? null };
}

/** What the browser needs to open Meta's Embedded Signup, or null when option B isn't set up on this server. */
export function embeddedSignupConfig() {
  const appId = process.env.META_APP_ID;
  const configId = process.env.WHATSAPP_EMBEDDED_CONFIG_ID;
  if (!appId || !configId || !process.env.META_APP_SECRET || !encryptionConfigured()) return null;
  return { appId, configId, version: graphVersion() };
}

export const appSecret = () => process.env.META_APP_SECRET ?? null;
export const verifyToken = () => process.env.WHATSAPP_VERIFY_TOKEN ?? null;
