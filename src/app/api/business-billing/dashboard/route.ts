import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { accountingSettings } from "@/lib/business-billing/accounting/service";
import { readReportParams } from "@/lib/business-billing/reports/catalog";
import { billingDashboard } from "@/lib/business-billing/reports/dashboard";

// GET /api/business-billing/dashboard?from=&to=&customerId= (billing.reports.view):
// headline numbers, monthly trends, top customers and items, tax and recent activity.
// The period defaults to this financial year to date.
export const GET = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.reports.view");
  const s = await accountingSettings(organizationId);
  const p = readReportParams(new URL(request.url).searchParams, s.today, s.financialYearStartMonth);
  const data = await billingDashboard(organizationId, { from: p.from, to: p.to, customerId: p.customerId });
  return Response.json({ ...data, financialYear: s.financialYear, financialYearStartMonth: s.financialYearStartMonth });
});
