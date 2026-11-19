import { randomBytes } from "node:crypto";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { removeTestTenants } from "@/test/cleanup-tenants";

import { autoSendReceipt, listMessages, runCompanyReminders, sendDocumentWhatsApp, sendReminderNow, setCommunicationSettings } from "../communication/service";
import { DEFAULT_COMMUNICATION } from "../communication/settings";
import { validateCustomer } from "../contacts-validation";
import { createCustomer } from "../customers";
import { createDraft, issueDocument } from "../documents/service";
import { validateDocument } from "../documents/validation";
import { recordPayment } from "../payments/service";
import { saveBillingSettings } from "../settings";
import { withTenant } from "../tenant-db";
import { TEMPLATE_NAMES } from "./templates";
import { connectOwnNumber, disconnectOwnNumber, handleWebhook, senderFor, whatsappStatus } from "./service";

// Real database plus a fake Meta Graph API (WHATSAPP_GRAPH_URL), so the whole
// flow runs without a Meta account.

const stamp = Date.now().toString(36);
const A = `watest-a-${stamp}`;
const B = `watest-b-${stamp}`;
const USER = null as unknown as string;
const ids: Record<string, string> = {};
const OWN_PHONE = `9${stamp}`;

type Call = { method: string; path: string; auth: string | null; query: URLSearchParams; body: Record<string, unknown> | null };
const calls: Call[] = [];
let failNextSend = false;
let server: Server;
const ENV_KEYS = ["WHATSAPP_GRAPH_URL", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WABA_ID", "META_APP_ID", "META_APP_SECRET", "WHATSAPP_EMBEDDED_CONFIG_ID", "APP_ENCRYPTION_KEY", "WHATSAPP_PLATFORM_MONTHLY_LIMIT", "WHATSAPP_DELIVERY", "EMAIL_DELIVERY"];
const saved: Record<string, string | undefined> = {};

function fakeGraph(): Promise<string> {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const path = url.pathname.replace(/^\/v[\d.]+\//, "");
      const call: Call = { method: req.method ?? "GET", path, auth: req.headers.authorization ?? null, query: url.searchParams, body: raw ? JSON.parse(raw) : null };
      calls.push(call);
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (path === "oauth/access_token") return call.query.get("code") === "good-code" && call.query.get("client_secret") === "app-secret" ? send(200, { access_token: "biz-token", token_type: "bearer" }) : send(400, { error: { message: "Invalid code", code: 100 } });
      if (path.endsWith("/subscribed_apps")) return send(200, { success: true });
      if (path.endsWith("/register")) return send(200, { success: true });
      if (path.endsWith("/message_templates")) return call.method === "GET" ? send(200, { data: [{ name: TEMPLATE_NAMES.document, status: "APPROVED", language: "en" }] }) : send(200, { id: "t1", status: "PENDING" });
      if (path.endsWith("/messages")) {
        if (failNextSend) {
          failNextSend = false;
          return send(400, { error: { message: "(#131026) Message undeliverable", code: 131026 } });
        }
        return send(200, { messaging_product: "whatsapp", messages: [{ id: `wamid.${calls.length}` }] });
      }
      if (path === OWN_PHONE) return send(200, { display_phone_number: "+91 98765 00000", verified_name: "Own Co" });
      send(404, { error: { message: "unknown path" } });
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String((e as Error).message ?? e);
  }
}
const lastSend = () => calls.filter((c) => c.path.endsWith("/messages")).at(-1)!;
const shared = (on: boolean, extra: Partial<typeof DEFAULT_COMMUNICATION> = {}) => setCommunicationSettings(A, USER, { ...DEFAULT_COMMUNICATION, whatsappShared: on, ...extra });

beforeAll(async () => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  Object.assign(process.env, {
    WHATSAPP_GRAPH_URL: await fakeGraph(),
    WHATSAPP_PHONE_NUMBER_ID: "platform-phone",
    WHATSAPP_ACCESS_TOKEN: "platform-token",
    WHATSAPP_WABA_ID: "platform-waba",
    META_APP_ID: "app-id",
    META_APP_SECRET: "app-secret",
    WHATSAPP_EMBEDDED_CONFIG_ID: "config-id",
    APP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    WHATSAPP_PLATFORM_MONTHLY_LIMIT: "1000",
    EMAIL_DELIVERY: "log",
  });
  delete process.env.WHATSAPP_DELIVERY;
  await db.insert(organization).values([
    { id: A, name: "WA A", slug: A, createdAt: new Date() },
    { id: B, name: "WA B", slug: B, createdAt: new Date() },
  ]);
  const company = { legalName: "Chat Co", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, countryCode: "IN", currency: "INR" as const, financialYearStartMonth: 4, invoicePrefix: "INV" };
  await saveBillingSettings(A, USER, company);
  await saveBillingSettings(B, USER, { ...company, legalName: "Other Co" });
  const c = validateCustomer({ name: "Ravi", phone: "98765 43210", billingAddress: { countryCode: "IN", stateCode: "27" } });
  if (!c.ok) throw new Error();
  ids.customer = (await createCustomer(A, USER, c.values)).id;
  const v = validateDocument("invoices", { customerId: ids.customer, issueDate: "2026-11-01", extraDate: "2026-11-05", lines: [{ description: "Work", quantity: "1", rate: "1000", taxRate: "18" }] });
  if (!v.ok) throw new Error();
  ids.invoice = (await issueDocument(A, USER, "invoices", (await createDraft(A, USER, "invoices", v.values)).id)).id;
});

afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  server?.close();
  await removeTestTenants([A, B]);
});

beforeEach(() => {
  failNextSend = false;
});

describe("the shared number (option A)", () => {
  it("off until the company turns it on", async () => {
    expect((await senderFor(A)).sender).toBeNull();
    expect(await code(sendDocumentWhatsApp(A, USER, "invoices", ids.invoice, null))).toBe("WHATSAPP_NOT_SET_UP");
    await shared(true);
    expect((await whatsappStatus(A)).active).toBe("platform");
  });

  it("sends the document template to the customer's number with a link button", async () => {
    const r = await sendDocumentWhatsApp(A, USER, "invoices", ids.invoice, null);
    expect(r).toMatchObject({ status: "sent" });
    const call = lastSend();
    expect(call.path).toBe("platform-phone/messages");
    expect(call.auth).toBe("Bearer platform-token");
    const template = call.body!.template as { name: string; components: { parameters: { text: string }[] }[] };
    expect(call.body).toMatchObject({ messaging_product: "whatsapp", to: "919876543210", type: "template" });
    expect(template.name).toBe(TEMPLATE_NAMES.document);
    expect(template.components[0].parameters.map((p) => p.text)).toEqual(["Ravi", "Chat Co", "invoice", expect.stringMatching(/^INV/), "₹1,180.00"]);
    expect(template.components[1].parameters[0].text).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const log = (await listMessages(A, "invoices", ids.invoice))[0];
    expect(log).toMatchObject({ channel: "whatsapp", recipient: "+919876543210", status: "sent" });
  });

  it("webhook statuses move forward only; failures carry Meta's reason", async () => {
    const [{ provider }] = (await withTenant(A, (tx) => tx.execute<{ provider: string }>(sql`select provider_message_id as provider from billing_messages where organization_id = ${A} and channel = 'whatsapp' order by created_at desc limit 1`))).rows;
    const status = (s: string, errors?: unknown) => ({ entry: [{ changes: [{ value: { statuses: [{ id: provider, status: s, ...(errors ? { errors } : {}) }] } }] }] });
    expect(await handleWebhook(status("delivered"))).toBe(1);
    expect(await handleWebhook(status("read"))).toBe(1);
    expect(await handleWebhook(status("delivered"))).toBe(0); // never backwards
    expect((await listMessages(A, "invoices", ids.invoice))[0].status).toBe("read");
    expect(await handleWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.unknown", status: "read" }] } }] }] })).toBe(0);
  });

  it("Meta refusing a message: logged as failed, reported", async () => {
    failNextSend = true;
    expect(await code(sendDocumentWhatsApp(A, USER, "invoices", ids.invoice, null))).toBe("WHATSAPP_FAILED");
    expect((await listMessages(A, "invoices", ids.invoice))[0]).toMatchObject({ status: "failed", error: expect.stringContaining("undeliverable") });
  });

  it("the shared number has a monthly limit per company", async () => {
    process.env.WHATSAPP_PLATFORM_MONTHLY_LIMIT = "1";
    expect(await code(sendDocumentWhatsApp(A, USER, "invoices", ids.invoice, null))).toBe("WHATSAPP_LIMIT");
    process.env.WHATSAPP_PLATFORM_MONTHLY_LIMIT = "1000";
  });

  it("a typed number is used and checked", async () => {
    expect(await code(sendDocumentWhatsApp(A, USER, "invoices", ids.invoice, "12"))).toBe("INVALID_FIELDS");
    await sendDocumentWhatsApp(A, USER, "invoices", ids.invoice, "+91 99999 11111");
    expect(lastSend().body!.to).toBe("919999911111");
  });
});

describe("reminders and receipts on WhatsApp", () => {
  it("scheduled reminders go on WhatsApp once, tracked apart from email", async () => {
    await shared(true, { reminders: { ...DEFAULT_COMMUNICATION.reminders, enabled: true, viaEmail: false, viaWhatsApp: true } });
    const now = new Date("2026-11-12T06:00:00Z");
    expect((await runCompanyReminders(A, now)).sent).toBe(1);
    const template = lastSend().body!.template as { name: string; components: { parameters: { text: string }[] }[] };
    expect(template.name).toBe(TEMPLATE_NAMES.reminder);
    expect(template.components[0].parameters[4].text).toBe("was due on 5 November 2026 and is still unpaid");
    expect((await runCompanyReminders(A, now)).sent).toBe(0);
    // Turning email on too sends the email for the same stage, but no second WhatsApp.
    await shared(true, { reminders: { ...DEFAULT_COMMUNICATION.reminders, enabled: true, viaEmail: true, viaWhatsApp: true } });
    const before = calls.length;
    await runCompanyReminders(A, now);
    expect(calls.slice(before).some((c) => c.path.endsWith("/messages"))).toBe(false);
  });

  it("send reminder now on WhatsApp", async () => {
    expect(await sendReminderNow(A, USER, ids.invoice, "whatsapp")).toMatchObject({ status: "sent" });
  });

  it("automatic receipt on WhatsApp", async () => {
    await shared(true, { autoReceiptWhatsApp: true });
    const p = await recordPayment(A, USER, { customerId: ids.customer, paymentDate: "2026-11-11", amountPaise: 5000, method: "cash", reference: null, notes: null, allocations: [] }, null);
    expect(await autoSendReceipt(A, USER, p.id)).toMatchObject({ status: "sent" });
    expect((lastSend().body!.template as { name: string }).name).toBe(TEMPLATE_NAMES.receipt);
  });
});

describe("a company's own number (option B)", () => {
  it("a bad or expired sign-up code is refused", async () => {
    expect(await code(connectOwnNumber(A, USER, { code: "old-code", wabaId: "own-waba", phoneNumberId: OWN_PHONE, businessId: null }))).toBe("WHATSAPP_CONNECT_FAILED");
  });

  it("connects: token exchange, webhook subscription, registration, templates; token stored encrypted", async () => {
    const s = await connectOwnNumber(A, USER, { code: "good-code", wabaId: "own-waba", phoneNumberId: OWN_PHONE, businessId: "biz" });
    expect(s.active).toBe("own");
    expect(s.connection).toMatchObject({ status: "connected", displayPhoneNumber: "+91 98765 00000", verifiedName: "Own Co" });
    expect(s.connection?.templates).toMatchObject({ [TEMPLATE_NAMES.document]: "APPROVED", [TEMPLATE_NAMES.reminder]: "PENDING", [TEMPLATE_NAMES.receipt]: "PENDING" });
    const paths = calls.map((c) => `${c.method} ${c.path}`);
    expect(paths).toEqual(expect.arrayContaining(["GET oauth/access_token", "POST own-waba/subscribed_apps", `POST ${OWN_PHONE}/register`, "POST own-waba/message_templates"]));
    const register = calls.find((c) => c.path === `${OWN_PHONE}/register`)!;
    expect(register.body).toMatchObject({ messaging_product: "whatsapp", pin: expect.stringMatching(/^\d{6}$/) });
    const [row] = (await withTenant(A, (tx) => tx.execute<{ token_encrypted: string }>(sql`select token_encrypted from whatsapp_connections where organization_id = ${A}`))).rows;
    expect(row.token_encrypted).not.toContain("biz-token");
    expect(JSON.stringify(s)).not.toContain("biz-token");
  });

  it("then sends from the company's own number with its own token", async () => {
    await sendDocumentWhatsApp(A, USER, "invoices", ids.invoice, null);
    expect(lastSend().path).toBe(`${OWN_PHONE}/messages`);
    expect(lastSend().auth).toBe("Bearer biz-token");
  });

  it("a number belongs to one company; other companies see nothing", async () => {
    expect(await code(connectOwnNumber(B, USER, { code: "good-code", wabaId: "own-waba", phoneNumberId: OWN_PHONE, businessId: null }))).toBe("WHATSAPP_NUMBER_TAKEN");
    expect((await whatsappStatus(B)).connection).toBeNull();
    expect((await senderFor(B)).sender).toBeNull();
  });

  it("disconnecting falls back to the shared number", async () => {
    const s = await disconnectOwnNumber(A);
    expect(s.connection).toBeNull();
    expect(s.active).toBe("platform");
  });
});
