import { resolveShare } from "@/lib/business-billing/communication/shares";
import type { DocumentSlug } from "@/lib/business-billing/documents/types";
import { documentPdf, pdfResponse, receiptPdf } from "@/lib/business-billing/pdf/service";
import { SHARE_LIMIT_PER_MINUTE, clientIp, rateLimit } from "@/lib/rate-limit";

// GET /api/share/:token[?download=1]: the PDF behind a share link. Public (no login): the
// secret token is the permission, and it only ever opens the one document it was made for.
export async function GET(request: Request, { params }: RouteContext<"/api/share/[token]">) {
  // Public endpoint: slow down anyone hammering it (guessing tokens, scraping).
  const limit = rateLimit(`share:${clientIp(request.headers)}`, SHARE_LIMIT_PER_MINUTE, 60_000);
  if (!limit.ok) return new Response("Too many requests. Try again shortly.", { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const share = await resolveShare((await params).token);
  if (!share) return new Response("This link has expired or was turned off.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const pdf =
    share.documentType === "receipt"
      ? await receiptPdf(share.organizationId, share.documentId)
      : await documentPdf(share.organizationId, share.documentType as DocumentSlug, share.documentId);
  const res = pdfResponse(pdf, new URL(request.url).searchParams.get("download") === "1");
  res.headers.set("X-Robots-Tag", "noindex");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
