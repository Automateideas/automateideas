import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { type StockQuery, stockSummary } from "@/lib/business-billing/inventory/service";
import { parseListQuery } from "@/lib/business-billing/records";
import { editAccess } from "@/lib/business-billing/route-helpers";

const STATUSES = ["all", "attention", "ok", "low", "out", "negative"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/business-billing/stock?q=&warehouseId=&asOf=&stock=all|attention|low|out|negative&page=
// (billing.view): products that track stock, with quantity on hand, value and low-stock status.
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const p = new URL(request.url).searchParams;
  const { q, page, pageSize } = parseListQuery(request.url);
  const asOf = p.get("asOf");
  const query: StockQuery = {
    q,
    page,
    pageSize,
    warehouseId: p.get("warehouseId") || null,
    asOf: asOf && DATE_RE.test(asOf) ? asOf : null,
    status: STATUSES.find((s) => s === p.get("stock")) ?? "all",
  };
  return Response.json({ ...(await stockSummary(ctx.organizationId, query)), ...editAccess(ctx, "billing.inventory.manage") });
});
