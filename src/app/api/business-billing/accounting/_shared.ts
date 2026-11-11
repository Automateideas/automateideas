import { accountingSettings } from "@/lib/business-billing/accounting/service";
import { readAsOf, readPeriod } from "@/lib/business-billing/accounting/validation";
import { todayInIndia } from "@/lib/business-billing/documents/types";

/** ?from=&to= for a statement, defaulting to this financial year to date. */
export async function periodFrom(request: Request, organizationId: string) {
  const s = await accountingSettings(organizationId);
  return readPeriod(new URL(request.url).searchParams, s.today, s.financialYearStartMonth);
}

/** ?asOf= for a statement, defaulting to today (India). */
export const asOfFrom = (request: Request) => readAsOf(new URL(request.url).searchParams, todayInIndia());
