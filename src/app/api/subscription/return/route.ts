import { NextResponse } from "next/server";

import { verifyPayuHash } from "@/lib/subscription-billing/payu";

// PayU sends the browser here (surl/furl) after checkout. This only decides
// which message to show; the webhook is what changes seats and plan status.
export async function POST(request: Request) {
  let ok = false;
  try {
    const params = Object.fromEntries(
      [...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]),
    );
    ok = verifyPayuHash(params) && params.status === "success";
  } catch {}

  const url = new URL("/dashboard", request.url);
  url.searchParams.set("billing", ok ? "processing" : "failed");
  return NextResponse.redirect(url, 303);
}
