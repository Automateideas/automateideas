import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { documentPdf, pdfResponse } from "@/lib/business-billing/pdf/service";

import { slugOf } from "../../../_shared";

// GET /api/business-billing/documents/:type/:id/pdf[?download=1] (billing.view): the document as a PDF.
export const GET = route(async (request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/pdf">) => {
  const { type, id } = await params;
  const slug = slugOf(type);
  const { organizationId } = await requireBillingPermission("billing.view");
  const pdf = await documentPdf(organizationId, slug, id);
  return pdfResponse(pdf, new URL(request.url).searchParams.get("download") === "1");
});
