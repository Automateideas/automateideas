import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { accountingSettings } from "@/lib/business-billing/accounting/service";
import { notFound } from "@/lib/business-billing/records";
import { isReportId, readReportParams } from "@/lib/business-billing/reports/catalog";
import { runReport } from "@/lib/business-billing/reports/service";
import { fileName, toCsv, toXlsx } from "@/lib/business-billing/reports/table";

// GET /api/business-billing/reports/:report?from=&to=&asOf=&groupBy=&customerId=&supplierId=&status=&format=json|csv|xlsx
// (billing.reports.view). One report as JSON for the screen, or as a CSV / Excel download.
// The period defaults to this financial year to date.
export const GET = route(async (request: Request, { params }: RouteContext<"/api/business-billing/reports/[report]">) => {
  const { organizationId } = await requireBillingPermission("billing.reports.view");
  const { report } = await params;
  if (!isReportId(report)) notFound("report");
  const url = new URL(request.url);
  const s = await accountingSettings(organizationId);
  const p = readReportParams(url.searchParams, s.today, s.financialYearStartMonth);
  const table = await runReport(organizationId, report, p);
  const format = url.searchParams.get("format");
  const dated = ["trial-balance", "balance-sheet", "customer-outstanding", "supplier-outstanding"].includes(report) ? [report === "trial-balance" || report === "balance-sheet" ? p.asOf : s.today] : [p.from, p.to];
  const headers = (type: string, name: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "no-store",
  });
  if (format === "csv") return new Response(toCsv(table), { headers: headers("text/csv; charset=utf-8", fileName(report, dated, "csv")) });
  if (format === "xlsx") {
    return new Response(Buffer.from(toXlsx(table)), { headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName(report, dated, "xlsx")) });
  }
  return Response.json({ ...table, params: p });
});
