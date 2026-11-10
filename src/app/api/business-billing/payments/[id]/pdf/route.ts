import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { pdfResponse, receiptPdf } from "@/lib/business-billing/pdf/service";

// GET /api/business-billing/payments/:id/pdf[?download=1] (billing.view): the payment receipt as a PDF.
export const GET = route(async (request: Request, { params }: RouteContext<"/api/business-billing/payments/[id]/pdf">) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  const pdf = await receiptPdf(organizationId, (await params).id);
  return pdfResponse(pdf, new URL(request.url).searchParams.get("download") === "1");
});
