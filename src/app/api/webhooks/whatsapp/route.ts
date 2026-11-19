import { createHmac, timingSafeEqual } from "node:crypto";

import { appSecret, verifyToken } from "@/lib/business-billing/whatsapp/config";
import { handleWebhook } from "@/lib/business-billing/whatsapp/service";

// Meta's WhatsApp webhook: delivery statuses (sent, delivered, read, failed)
// for messages we sent. Configure in your Meta app → WhatsApp → Configuration:
//   Callback URL: https://<your domain>/api/webhooks/whatsapp
//   Verify token: the value of WHATSAPP_VERIFY_TOKEN
//   Subscribe to: messages

// GET: Meta checks the URL once with hub.mode=subscribe, hub.verify_token and hub.challenge.
export function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const expected = verifyToken();
  if (!expected) return new Response("Not found", { status: 404 });
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === expected) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

// POST: events, signed with the app secret (X-Hub-Signature-256: sha256=<hex HMAC of the raw body>).
export async function POST(request: Request) {
  const secret = appSecret();
  if (!secret) return new Response("Not found", { status: 404 });
  const raw = await request.text();
  const given = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Invalid signature", { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }
  try {
    const changed = await handleWebhook(body);
    return Response.json({ ok: true, changed });
  } catch (error) {
    // 500 makes Meta retry later.
    console.error("WhatsApp webhook failed", error);
    return new Response("Error", { status: 500 });
  }
}
