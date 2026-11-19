import { randomInt } from "node:crypto";

import { and, count, eq, gte, lt, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { billingMessages, billingSettings, whatsappConnections } from "@/db/schema";
import { open, seal } from "@/lib/crypto/secret-box";
import { monthBounds } from "@/lib/subscription-billing/entitlements";

import { conflict, invalid } from "../records";
import { readCommunication } from "../communication/settings";
import { assertSendRate } from "../communication/limits";
import { withTenant } from "../tenant-db";
import { appSecret, embeddedSignupConfig, platformMonthlyLimit, platformSender, whatsappLogMode } from "./config";
import { GraphError, graph } from "./graph";
import { ensureTemplates } from "./manage";
import { TEMPLATE_NAMES, type TemplateKind, templateMessage } from "./templates";

// Sending WhatsApp messages through Meta's Cloud API, from either the
// company's own connected number (option B) or the shared Automate Ideas
// number (option A, when the company turned it on). Every message is logged
// in billing_messages; Meta's webhook later moves it to delivered / read / failed.

export type Sender = { source: "own" | "platform"; phoneNumberId: string; token: string; wabaId: string | null; display: string | null };

/* ---------------- Who sends ---------------- */

async function connectionOf(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    const [c] = await tx.select().from(whatsappConnections).where(eq(whatsappConnections.organizationId, organizationId));
    return c ?? null;
  });
}

async function sharedChosen(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    const [s] = await tx.select({ c: billingSettings.communication }).from(billingSettings).where(eq(billingSettings.organizationId, organizationId));
    return readCommunication(s?.c).whatsappShared;
  });
}

/** The number this company sends from now, or why it can't send. */
export async function senderFor(organizationId: string): Promise<{ sender: Sender | null; reason: string | null }> {
  const c = await connectionOf(organizationId);
  if (c?.status === "connected") {
    try {
      return { sender: { source: "own", phoneNumberId: c.phoneNumberId, token: open(c.tokenEncrypted), wabaId: c.wabaId, display: c.displayPhoneNumber }, reason: null };
    } catch {
      return { sender: null, reason: "Your WhatsApp number's saved key can't be read on this server (APP_ENCRYPTION_KEY changed?). Connect it again." };
    }
  }
  const p = platformSender();
  if (p && (await sharedChosen(organizationId))) return { sender: { source: "platform", phoneNumberId: p.phoneNumberId, token: p.token, wabaId: p.wabaId, display: null }, reason: null };
  if (whatsappLogMode() && (await sharedChosen(organizationId))) return { sender: { source: "platform", phoneNumberId: "log", token: "log", wabaId: null, display: null }, reason: null };
  return { sender: null, reason: "WhatsApp sending isn't set up. Connect your number, or turn on the Automate Ideas number, in Settings → Email and reminders." };
}

async function usedThisMonth(organizationId: string) {
  const { from, to } = monthBounds();
  return withTenant(organizationId, async (tx) => {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(billingMessages)
      .where(and(eq(billingMessages.organizationId, organizationId), eq(billingMessages.channel, "whatsapp"), notInArray(billingMessages.status, ["failed", "logged"]), gte(billingMessages.createdAt, from), lt(billingMessages.createdAt, to)));
    return n;
  });
}

/** For the settings page: what's available, what's connected, and this month's use of the shared number. */
export async function whatsappStatus(organizationId: string) {
  const [c, shared, used] = await Promise.all([connectionOf(organizationId), sharedChosen(organizationId), usedThisMonth(organizationId)]);
  const platform = !!platformSender() || whatsappLogMode();
  return {
    platformAvailable: platform,
    embeddedSignup: embeddedSignupConfig(),
    logMode: whatsappLogMode(),
    shared,
    connection: c
      ? { displayPhoneNumber: c.displayPhoneNumber, verifiedName: c.verifiedName, status: c.status, templates: c.templates as Record<string, string>, lastError: c.lastError, connectedAt: c.connectedAt }
      : null,
    active: c?.status === "connected" ? ("own" as const) : shared && platform ? ("platform" as const) : null,
    usage: { used, limit: platformMonthlyLimit() },
  };
}

/* ---------------- Sending ---------------- */

export type WhatsAppLog = { kind: string; documentType: string; documentId: string; customerId: string | null; dedupeKey?: string | null };

/**
 * Sends one approved template message and logs it. Returns null when another
 * run already sent this exact reminder (dedupe key). Refuses (409) when
 * WhatsApp isn't set up, the shared number's monthly limit is reached, or Meta refuses it.
 */
export async function sendTemplate(organizationId: string, userId: string | null, m: { kind: TemplateKind; to: string; params: string[]; shareToken: string; log: WhatsAppLog }) {
  const { sender, reason } = await senderFor(organizationId);
  if (!sender) conflict("WHATSAPP_NOT_SET_UP", reason!);
  await assertSendRate(organizationId);
  if (sender.source === "platform" && !whatsappLogMode() && (await usedThisMonth(organizationId)) >= platformMonthlyLimit()) {
    conflict("WHATSAPP_LIMIT", `You've sent ${platformMonthlyLimit()} WhatsApp messages from the Automate Ideas number this month, the limit. Connect your own number to send more.`);
  }
  const id = await withTenant(organizationId, async (tx) => {
    const [row] = await tx
      .insert(billingMessages)
      .values({
        organizationId,
        channel: "whatsapp",
        kind: m.log.kind,
        documentType: m.log.documentType,
        documentId: m.log.documentId,
        customerId: m.log.customerId,
        recipient: `+${m.to}`,
        subject: `${TEMPLATE_NAMES[m.kind]} via ${sender.source === "own" ? (sender.display ?? "your number") : "Automate Ideas number"}`,
        status: "sending",
        dedupeKey: m.log.dedupeKey ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .onConflictDoNothing()
      .returning({ id: billingMessages.id });
    return row?.id ?? null;
  });
  if (!id) return null;
  const finish = (status: "sent" | "failed" | "logged", providerMessageId: string | null, error: string | null) =>
    withTenant(organizationId, (tx) =>
      tx
        .update(billingMessages)
        .set({ status, providerMessageId, error, ...(status === "failed" ? { dedupeKey: null } : {}), updatedAt: new Date() })
        .where(and(eq(billingMessages.organizationId, organizationId), eq(billingMessages.id, id))),
    );
  if (whatsappLogMode()) {
    console.info(`[billing-whatsapp] to=+${m.to} template=${TEMPLATE_NAMES[m.kind]} from=${sender.source}`);
    await finish("logged", null, null);
    return { id, status: "logged" as const, providerMessageId: null };
  }
  try {
    const res = await graph<{ messages?: { id: string }[] }>(`${sender.phoneNumberId}/messages`, {
      token: sender.token,
      body: { messaging_product: "whatsapp", recipient_type: "individual", to: m.to, type: "template", template: templateMessage(m.kind, m.params, m.shareToken) },
    });
    const providerMessageId = res.messages?.[0]?.id ?? null;
    await finish("sent", providerMessageId, null);
    return { id, status: "sent" as const, providerMessageId };
  } catch (e) {
    const message = e instanceof GraphError ? e.message : (e as Error).message;
    await finish("failed", null, message.slice(0, 500));
    conflict("WHATSAPP_FAILED", `WhatsApp didn't accept the message: ${message}`);
  }
}

/* ---------------- Connecting a company's own number (option B) ---------------- */

export type ConnectInput = { code: string; wabaId: string; phoneNumberId: string; businessId: string | null };

export function validateConnect(raw: Record<string, unknown>): ConnectInput {
  const id = (k: string, required = true) => {
    const v = raw[k];
    if ((v === undefined || v === null || v === "") && !required) return null;
    if (typeof v !== "string" || !/^[A-Za-z0-9_.-]{1,512}$/.test(v)) invalid({ [k]: "Missing from WhatsApp's sign-up. Try connecting again." });
    return v as string;
  };
  return { code: id("code")!, wabaId: id("wabaId")!, phoneNumberId: id("phoneNumberId")!, businessId: id("businessId", false) };
}

/**
 * Finishes Meta's Embedded Signup on the server: swaps the code (valid 30
 * seconds) for the company's business token, subscribes our app to its
 * WhatsApp Business account, registers the number for the Cloud API, reads
 * its display number and creates our message templates in it.
 */
export async function connectOwnNumber(organizationId: string, userId: string, v: ConnectInput) {
  const cfg = embeddedSignupConfig();
  if (!cfg) conflict("WHATSAPP_NOT_SET_UP", "Connecting your own WhatsApp number isn't set up on this server yet.");
  let token: string;
  try {
    token = (await graph<{ access_token: string }>("oauth/access_token", { query: { client_id: cfg.appId, client_secret: appSecret()!, code: v.code } })).access_token;
  } catch (e) {
    conflict("WHATSAPP_CONNECT_FAILED", `Meta didn't accept the sign-up (it may have taken too long). Try again. (${(e as Error).message})`);
  }
  const problems: string[] = [];
  const step = async <T,>(label: string, fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      problems.push(`${label}: ${(e as Error).message}`);
      return null;
    }
  };
  await step("Subscribing to updates", () => graph(`${v.wabaId}/subscribed_apps`, { method: "POST", token }));
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await step("Registering the number", () => graph(`${v.phoneNumberId}/register`, { token, body: { messaging_product: "whatsapp", pin } }));
  const info = await step("Reading the number", () => graph<{ display_phone_number?: string; verified_name?: string }>(v.phoneNumberId, { token, query: { fields: "display_phone_number,verified_name" } }));
  const templates = (await step("Creating message templates", () => ensureTemplates(v.wabaId, token))) ?? {};
  const values = {
    wabaId: v.wabaId,
    phoneNumberId: v.phoneNumberId,
    businessId: v.businessId,
    displayPhoneNumber: info?.display_phone_number ?? null,
    verifiedName: info?.verified_name ?? null,
    tokenEncrypted: seal(token),
    pinEncrypted: seal(pin),
    status: problems.some((p) => p.startsWith("Registering")) ? "error" : "connected",
    templates,
    lastError: problems.length ? problems.join(" · ").slice(0, 1000) : null,
    connectedAt: new Date(),
    updatedBy: userId,
  };
  try {
    await withTenant(organizationId, (tx) =>
      tx
        .insert(whatsappConnections)
        .values({ organizationId, ...values, createdBy: userId })
        .onConflictDoUpdate({ target: whatsappConnections.organizationId, set: values }),
    );
  } catch (e) {
    if (String((e as { cause?: { constraint?: string } }).cause?.constraint ?? (e as Error).message).includes("whatsapp_connections_phone_uq")) {
      conflict("WHATSAPP_NUMBER_TAKEN", "This WhatsApp number is already connected to another company on Automate Ideas.");
    }
    throw e;
  }
  return whatsappStatus(organizationId);
}

/** Checks the company's templates again (e.g. after Meta approves them) and creates any missing. */
export async function refreshTemplates(organizationId: string, userId: string) {
  const c = await connectionOf(organizationId);
  if (!c) conflict("NOT_CONNECTED", "Connect your WhatsApp number first.");
  const templates = await ensureTemplates(c.wabaId, open(c.tokenEncrypted));
  await withTenant(organizationId, (tx) => tx.update(whatsappConnections).set({ templates, updatedBy: userId }).where(eq(whatsappConnections.organizationId, organizationId)));
  return whatsappStatus(organizationId);
}

/** Disconnects the company's own number (messages then use the shared number if turned on, else stop). */
export async function disconnectOwnNumber(organizationId: string) {
  const c = await connectionOf(organizationId);
  if (!c) return whatsappStatus(organizationId);
  try {
    await graph(`${c.wabaId}/subscribed_apps`, { method: "DELETE", token: open(c.tokenEncrypted) });
  } catch {
    // Best effort: the company can also remove the app in Meta Business settings.
  }
  await withTenant(organizationId, (tx) => tx.delete(whatsappConnections).where(eq(whatsappConnections.organizationId, organizationId)));
  return whatsappStatus(organizationId);
}

/* ---------------- Webhook ---------------- */

type WebhookBody = { entry?: { changes?: { value?: { statuses?: { id?: string; status?: string; errors?: { title?: string; message?: string; error_data?: { details?: string } }[] }[] } }[] }[] };

/** Records delivery statuses from Meta (sent, delivered, read, failed). Returns how many messages changed. */
export async function handleWebhook(body: unknown) {
  let changed = 0;
  for (const entry of (body as WebhookBody).entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        if (!s.id || !s.status) continue;
        const err = s.errors?.[0];
        const error = err ? [err.title, err.message, err.error_data?.details].filter(Boolean).join(": ") : null;
        const { rows } = await db.execute<{ n: number }>(sql`select billing_whatsapp_status(${s.id}, ${s.status}, ${error}) as n`);
        changed += Number(rows[0]?.n ?? 0);
      }
    }
  }
  return changed;
}
