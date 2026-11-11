// Every report, its group and the filters it takes. Pure: the API validates
// against it and the report pages build their controls from it.

export type ReportFilter = "period" | "asOf" | "groupBy" | "customer" | "supplier" | "invoiceStatus" | "paymentStatus" | "warehouse" | "product";

export type ReportDef = { id: string; group: ReportGroup; label: string; description: string; filters: readonly ReportFilter[] };

export const REPORT_GROUPS = {
  sales: { label: "Sales", description: "What you sold, by day, customer, item or invoice." },
  purchases: { label: "Purchases", description: "What you bought and returned, by bill or supplier." },
  payments: { label: "Payments", description: "Money collected, what's owed both ways, and cash flow." },
  tax: { label: "Tax", description: "GST collected and paid, by rate and HSN/SAC." },
  inventory: { label: "Inventory", description: "Stock on hand and its value, movements and low stock." },
} as const;
export type ReportGroup = keyof typeof REPORT_GROUPS;

export const REPORTS: readonly ReportDef[] = [
  { id: "sales-register", group: "sales", label: "Invoice-wise sales", description: "Every invoice with its taxes, what's paid and what's due.", filters: ["period", "customer", "invoiceStatus"] },
  { id: "sales-by-period", group: "sales", label: "Sales by day, week, month or year", description: "Net sales (after credit and debit notes) per period.", filters: ["period", "groupBy", "customer"] },
  { id: "sales-by-customer", group: "sales", label: "Customer-wise sales", description: "Net sales per customer, with what each still owes.", filters: ["period"] },
  { id: "sales-by-item", group: "sales", label: "Product-wise sales", description: "Quantity and value sold per product or service.", filters: ["period", "customer"] },
  { id: "purchase-register", group: "purchases", label: "Purchase summary", description: "Every recorded bill with its taxes and balance.", filters: ["period", "supplier", "paymentStatus"] },
  { id: "purchases-by-supplier", group: "purchases", label: "Supplier-wise purchases", description: "Net purchases per supplier, with what you still owe.", filters: ["period"] },
  { id: "purchase-returns", group: "purchases", label: "Purchase returns", description: "Goods sent back to suppliers.", filters: ["period", "supplier"] },
  { id: "payment-collection", group: "payments", label: "Payment collection", description: "Payments received from customers.", filters: ["period", "customer"] },
  { id: "customer-outstanding", group: "payments", label: "Customer outstanding", description: "What each customer owes today, by age.", filters: ["customer"] },
  { id: "supplier-outstanding", group: "payments", label: "Supplier outstanding", description: "What you owe each supplier today, by age.", filters: ["supplier"] },
  { id: "cash-flow", group: "payments", label: "Cash flow", description: "Money in and out of cash and bank, by source.", filters: ["period"] },
  { id: "gst-summary", group: "tax", label: "GST summary", description: "Output tax, input tax credit and net GST payable, by rate.", filters: ["period"] },
  { id: "hsn-summary", group: "tax", label: "HSN/SAC summary of sales", description: "Taxable sales and tax per HSN/SAC code (GSTR-1 table 12).", filters: ["period"] },
  { id: "stock-summary", group: "inventory", label: "Stock summary and valuation", description: "Quantity and value of every tracked product on a date, at weighted average cost.", filters: ["asOf", "warehouse"] },
  { id: "stock-movements", group: "inventory", label: "Stock movements", description: "Every stock in and out: sales, purchases, returns, adjustments and transfers.", filters: ["period", "warehouse", "product"] },
  { id: "low-stock", group: "inventory", label: "Low stock", description: "Products below their minimum or out of stock today.", filters: ["warehouse"] },
];

/** Statements from Accounting, exportable through the same API (not listed on report pages). */
export const STATEMENT_REPORTS = ["trial-balance", "profit-loss", "balance-sheet"] as const;

export const reportDef = (id: string) => REPORTS.find((r) => r.id === id) ?? null;
export const isReportId = (id: string) => !!reportDef(id) || (STATEMENT_REPORTS as readonly string[]).includes(id);

export const GROUP_BY = ["day", "week", "month", "year"] as const;
export type GroupBy = (typeof GROUP_BY)[number];
export const GROUP_BY_LABELS: Record<GroupBy, string> = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" };

export const INVOICE_STATUS_FILTERS = [
  { value: "", label: "All (not void)" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partly paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
] as const;
export const PAYMENT_STATUS_FILTERS = [
  { value: "", label: "All (not void)" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partly paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
] as const;

export type ReportParams = {
  from: string;
  to: string;
  asOf: string;
  groupBy: GroupBy;
  customerId: string | null;
  supplierId: string | null;
  warehouseId: string | null;
  productId: string | null;
  status: string | null;
};

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: string | null): v is string => !!v && DATE_RE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/**
 * Report filters from a URL. The period defaults to this financial year to
 * date; unknown or malformed values fall back to their defaults.
 */
export function readReportParams(params: URLSearchParams, today: string, startMonth: number): ReportParams {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const fyStart = `${m >= startMonth ? y : y - 1}-${String(startMonth).padStart(2, "0")}-01`;
  let from = isDate(params.get("from")) ? params.get("from")! : fyStart;
  let to = isDate(params.get("to")) ? params.get("to")! : today;
  if (from > to) [from, to] = [to, from];
  const id = (k: string) => {
    const v = params.get(k);
    return v && ID_RE.test(v) ? v : null;
  };
  const status = params.get("status");
  const statuses: readonly string[] = [...INVOICE_STATUS_FILTERS, ...PAYMENT_STATUS_FILTERS].map((s) => s.value).filter(Boolean);
  return {
    from,
    to,
    asOf: isDate(params.get("asOf")) ? params.get("asOf")! : today,
    groupBy: (GROUP_BY as readonly string[]).includes(params.get("groupBy") ?? "") ? (params.get("groupBy") as GroupBy) : "month",
    customerId: id("customerId"),
    supplierId: id("supplierId"),
    warehouseId: id("warehouseId"),
    productId: id("productId"),
    status: status && statuses.includes(status) ? status : null,
  };
}
