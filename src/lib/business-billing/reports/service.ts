import { type SQL, sql } from "drizzle-orm";

import { ACCOUNT_TYPE_LABELS } from "../accounting/chart";
import { balanceSheet, profitAndLoss, trialBalance } from "../accounting/service";
import { todayInIndia } from "../documents/types";
import { billBalances, invoiceBalances } from "../payments/balances";
import { payablesReport } from "../payments/supplier-payments";
import { outstandingReport } from "../payments/service";
import { listWarehouses, type StockStatus, stockSummary } from "../inventory/service";
import { methodLabel } from "../payments/validation";
import { invalid } from "../records";
import { getBillingSettings } from "../settings";
import { type TenantTx, withTenant } from "../tenant-db";
import { GROUP_BY_LABELS, type ReportParams } from "./catalog";
import { type Column, ROW_CAP, type ReportRow, type ReportTable } from "./table";

// Reports for Business Billing. Each returns a ReportTable (columns + rows +
// totals) that the screen shows and the API exports as CSV or Excel.
//
// Sales and purchases count issued documents only (numbered, not void), by
// their issue date. "Net" figures subtract credit notes / purchase returns and
// add debit notes, the same way the books do.

/* ---------------- Shared ---------------- */

const n = (v: unknown) => Number(v ?? 0);
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
export const fmtDay = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));
const iso = (v: unknown) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : String(v ?? "").slice(0, 10));

async function heading(organizationId: string, period: string) {
  const s = await getBillingSettings(organizationId);
  const name = s.configured ? (s.tradeName ?? s.legalName) : s.legalName;
  return [name, period].filter(Boolean).join(" · ");
}
const periodText = (p: ReportParams) => `${fmtDay(p.from)} to ${fmtDay(p.to)}`;

const money = (key: string, label: string, secondary = false): Column => ({ key, label, type: "money", secondary });
const TAX_COLUMNS: Column[] = [money("taxable", "Taxable value"), money("cgst", "CGST", true), money("sgst", "SGST", true), money("igst", "IGST", true), money("cess", "Cess", true)];

/** Sums the given keys over rows (for a totals row). */
function sumRows(rows: ReportRow[], keys: string[], label: Record<string, string>): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = { ...label };
  for (const k of keys) out[k] = rows.reduce((a, r) => a + n(r[k]), 0);
  return out;
}

type DocTable = { table: string; party: "customer_id" | "supplier_id"; sign: 1 | -1; kind: string; items: string; parent: string };
export const SALES_DOCS: DocTable[] = [
  { table: "business_invoices", party: "customer_id", sign: 1, kind: "invoice", items: "business_invoice_items", parent: "invoice_id" },
  { table: "debit_notes", party: "customer_id", sign: 1, kind: "debit_note", items: "debit_note_items", parent: "debit_note_id" },
  { table: "credit_notes", party: "customer_id", sign: -1, kind: "credit_note", items: "credit_note_items", parent: "credit_note_id" },
];
export const PURCHASE_DOCS: DocTable[] = [
  { table: "purchase_bills", party: "supplier_id", sign: 1, kind: "bill", items: "purchase_bill_items", parent: "purchase_bill_id" },
  { table: "purchase_returns", party: "supplier_id", sign: -1, kind: "return", items: "purchase_return_items", parent: "purchase_return_id" },
];

/** Issued, not-void documents in the period, with a +1/−1 sign (notes and returns subtract). */
export function signedDocs(docs: DocTable[], organizationId: string, p: { from: string; to: string }, partyId: string | null): SQL {
  const parts = docs.map(
    (d) => sql`
    select ${d.kind}::text as kind, d.id, d.number, d.${sql.raw(d.party)} as party_id, d.issue_date, ${d.sign}::int as sign, d.reverse_charge,
      d.taxable_paise, d.cgst_paise, d.sgst_paise, d.igst_paise, d.cess_paise, d.total_paise
    from ${sql.raw(d.table)} d
    where d.organization_id = ${organizationId} and d.number is not null and d.voided_at is null
      and d.issue_date between ${p.from} and ${p.to}
      ${partyId ? sql`and d.${sql.raw(d.party)} = ${partyId}` : sql``}`,
  );
  return sql.join(parts, sql` union all `);
}

/** Lines of the same documents, signed. */
export function signedItems(docs: DocTable[], organizationId: string, p: { from: string; to: string }, partyId: string | null): SQL {
  const parts = docs.map(
    (d) => sql`
    select ${d.sign}::int as sign, d.reverse_charge, it.product_id, it.service_id, it.description, it.hsn_sac, it.unit_code, it.quantity, it.tax_rate,
      it.taxable_paise, it.cgst_paise, it.sgst_paise, it.igst_paise, it.cess_paise, it.total_paise
    from ${sql.raw(d.items)} it
    join ${sql.raw(d.table)} d on d.organization_id = it.organization_id and d.id = it.${sql.raw(d.parent)}
    where d.organization_id = ${organizationId} and d.number is not null and d.voided_at is null
      and d.issue_date between ${p.from} and ${p.to}
      ${partyId ? sql`and d.${sql.raw(d.party)} = ${partyId}` : sql``}`,
  );
  return sql.join(parts, sql` union all `);
}

const SIGNED_SUMS = sql`count(*) filter (where sign = 1 and kind in ('invoice', 'bill')) as docs,
  sum(sign * taxable_paise) as taxable, sum(sign * cgst_paise) as cgst, sum(sign * sgst_paise) as sgst,
  sum(sign * igst_paise) as igst, sum(sign * cess_paise) as cess, sum(sign * total_paise) as total`;

const taxCells = (r: Record<string, unknown>) => ({ taxable: n(r.taxable), cgst: n(r.cgst), sgst: n(r.sgst), igst: n(r.igst), cess: n(r.cess), total: n(r.total) });

async function startMonth(tx: TenantTx, organizationId: string) {
  const { rows } = await tx.execute<{ m: number }>(sql`select financial_year_start_month as m from billing_settings where organization_id = ${organizationId}`);
  return rows[0]?.m ?? 4;
}

/* ---------------- Sales ---------------- */

async function salesRegister(organizationId: string, p: ReportParams): Promise<ReportTable> {
  const today = todayInIndia();
  const statusSql =
    p.status === "void"
      ? sql`and i.voided_at is not null`
      : sql`and i.voided_at is null ${
          p.status === "unpaid"
            ? sql`and i.status = 'issued'`
            : p.status === "partially_paid"
              ? sql`and i.status = 'partially_paid'`
              : p.status === "paid"
                ? sql`and i.status = 'paid'`
                : p.status === "overdue"
                  ? sql`and i.status in ('issued', 'partially_paid') and i.due_date < ${today}`
                  : sql``
        }`;
  return withTenant(organizationId, async (tx) => {
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select i.id, i.number, i.issue_date, i.due_date, i.status, i.party_name, i.party_gstin,
        i.taxable_paise as taxable, i.cgst_paise as cgst, i.sgst_paise as sgst, i.igst_paise as igst, i.cess_paise as cess, i.total_paise as total
      from business_invoices i
      where i.organization_id = ${organizationId} and i.number is not null and i.issue_date between ${p.from} and ${p.to}
        ${p.customerId ? sql`and i.customer_id = ${p.customerId}` : sql``} ${statusSql}
      order by i.issue_date, i.number
      limit ${ROW_CAP + 1}`);
    const shown = rows.slice(0, ROW_CAP);
    const balances = p.status === "void" ? new Map() : await invoiceBalances(tx, organizationId, shown.map((r) => String(r.id)));
    const out: ReportRow[] = shown.map((r) => {
      const b = balances.get(String(r.id));
      const due = r.due_date ? iso(r.due_date) : null;
      const status = r.status === "void" ? "Void" : b && b.balancePaise > 0 && due && due < today ? "Overdue" : ({ issued: "Unpaid", partially_paid: "Partly paid", paid: "Paid" } as Record<string, string>)[String(r.status)] ?? String(r.status);
      return {
        _href: `/billing/invoices/${r.id}`,
        number: String(r.number),
        date: iso(r.issue_date),
        customer: String(r.party_name ?? ""),
        gstin: (r.party_gstin as string) ?? null,
        ...taxCells(r),
        paid: b ? b.paidPaise + b.creditedPaise - b.creditRefundedPaise : null,
        balance: b ? b.balancePaise : null,
        due,
        status,
      };
    });
    const columns: Column[] = [
      { key: "number", label: "Invoice", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "gstin", label: "GSTIN", type: "text", secondary: true },
      ...TAX_COLUMNS,
      money("total", "Total"),
      money("paid", "Paid / credited", true),
      money("balance", "Balance"),
      { key: "due", label: "Due", type: "date", secondary: true },
      { key: "status", label: "Status", type: "text" },
    ];
    return {
      title: "Invoice-wise sales",
      subtitle: await heading(organizationId, periodText(p)),
      columns,
      rows: out,
      totals: sumRows(out, ["taxable", "cgst", "sgst", "igst", "cess", "total", "paid", "balance"], { number: `Total (${out.length})` }),
      truncated: rows.length > ROW_CAP,
    };
  });
}

async function salesByPeriod(organizationId: string, p: ReportParams): Promise<ReportTable> {
  return withTenant(organizationId, async (tx) => {
    const sm = await startMonth(tx, organizationId);
    const bucket =
      p.groupBy === "day"
        ? sql`issue_date`
        : p.groupBy === "week"
          ? sql`date_trunc('week', issue_date)::date`
          : p.groupBy === "month"
            ? sql`date_trunc('month', issue_date)::date`
            : sql`make_date(extract(year from (issue_date - make_interval(months => ${sm - 1})))::int, ${sm}::int, 1)`;
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select ${bucket} as period, ${SIGNED_SUMS}
      from (${signedDocs(SALES_DOCS, organizationId, p, p.customerId)}) s
      group by 1 order by 1`);
    const label = (d: string) => {
      if (p.groupBy === "day") return d;
      if (p.groupBy === "week") return `Week of ${fmtDay(d)}`;
      if (p.groupBy === "month") return monthFmt.format(new Date(`${d}T00:00:00Z`));
      const y = Number(d.slice(0, 4));
      return sm === 1 ? String(y) : `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`;
    };
    const out: ReportRow[] = rows.map((r) => ({ period: label(iso(r.period)), invoices: n(r.docs), ...taxCells(r) }));
    return {
      title: `${GROUP_BY_LABELS[p.groupBy]} sales`,
      subtitle: await heading(organizationId, periodText(p)),
      columns: [{ key: "period", label: p.groupBy === "day" ? "Date" : "Period", type: p.groupBy === "day" ? "date" : "text" }, { key: "invoices", label: "Invoices", type: "number" }, ...TAX_COLUMNS, money("total", "Net sales")],
      rows: out,
      totals: sumRows(out, ["invoices", "taxable", "cgst", "sgst", "igst", "cess", "total"], { period: "Total" }),
      note: "Net of credit notes and debit notes, by issue date.",
    };
  });
}

async function salesByCustomer(organizationId: string, p: ReportParams): Promise<ReportTable> {
  const outstanding = await outstandingReport(organizationId);
  const owed = new Map(outstanding.customers.map((c) => [c.customerId, c.totalPaise]));
  return withTenant(organizationId, async (tx) => {
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select s.party_id, c.name, c.gstin, ${SIGNED_SUMS}
      from (${signedDocs(SALES_DOCS, organizationId, p, null)}) s
      join customers c on c.organization_id = ${organizationId} and c.id = s.party_id
      group by s.party_id, c.name, c.gstin
      order by sum(sign * total_paise) desc, c.name`);
    const total = rows.reduce((a, r) => a + n(r.total), 0);
    const out: ReportRow[] = rows.map((r) => ({
      _href: `/billing/customers/${r.party_id}`,
      customer: String(r.name),
      gstin: (r.gstin as string) ?? null,
      invoices: n(r.docs),
      ...taxCells(r),
      share: total ? Math.round((n(r.total) / total) * 10000) / 100 : 0,
      outstanding: owed.get(String(r.party_id)) ?? 0,
    }));
    return {
      title: "Customer-wise sales",
      subtitle: await heading(organizationId, periodText(p)),
      columns: [
        { key: "customer", label: "Customer", type: "text" },
        { key: "gstin", label: "GSTIN", type: "text", secondary: true },
        { key: "invoices", label: "Invoices", type: "number" },
        ...TAX_COLUMNS,
        money("total", "Net sales"),
        { key: "share", label: "Share %", type: "percent", secondary: true },
        money("outstanding", "Owes today"),
      ],
      rows: out,
      totals: sumRows(out, ["invoices", "taxable", "cgst", "sgst", "igst", "cess", "total", "outstanding"], { customer: "Total" }),
      note: "Net of credit and debit notes. \"Owes today\" is the current balance, whatever the period.",
    };
  });
}

export async function itemSummary(organizationId: string, p: ReportParams, docs: DocTable[], partyId: string | null) {
  return withTenant(organizationId, async (tx) => {
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select coalesce(pr.name, sv.name, min(x.description)) as name, coalesce(pr.id, sv.id) as item_id, (pr.id is not null) as is_product,
        min(x.hsn_sac) as hsn, min(x.unit_code) as unit, sum(x.sign * x.quantity) as qty,
        sum(x.sign * x.taxable_paise) as taxable, sum(x.sign * (x.cgst_paise + x.sgst_paise + x.igst_paise + x.cess_paise)) as tax, sum(x.sign * x.total_paise) as total
      from (${signedItems(docs, organizationId, p, partyId)}) x
      left join products pr on pr.organization_id = ${organizationId} and pr.id = x.product_id
      left join services sv on sv.organization_id = ${organizationId} and sv.id = x.service_id
      group by pr.id, sv.id, pr.name, sv.name, case when x.product_id is null and x.service_id is null then lower(trim(x.description)) end
      order by sum(x.sign * x.taxable_paise) desc`);
    return rows;
  });
}

async function salesByItem(organizationId: string, p: ReportParams): Promise<ReportTable> {
  const rows = await itemSummary(organizationId, p, SALES_DOCS, p.customerId);
  const out: ReportRow[] = rows.map((r) => ({
    _href: r.item_id ? `/billing/${r.is_product ? "products" : "services"}/${r.item_id}` : null,
    item: String(r.name ?? ""),
    hsn: (r.hsn as string) ?? null,
    qty: Math.round(n(r.qty) * 1000) / 1000,
    unit: (r.unit as string) ?? null,
    taxable: n(r.taxable),
    tax: n(r.tax),
    total: n(r.total),
  }));
  return {
    title: "Product-wise sales",
    subtitle: await heading(organizationId, periodText(p)),
    columns: [
      { key: "item", label: "Product or service", type: "text" },
      { key: "hsn", label: "HSN/SAC", type: "text", secondary: true },
      { key: "qty", label: "Quantity", type: "number" },
      { key: "unit", label: "Unit", type: "text", secondary: true },
      money("taxable", "Taxable value"),
      money("tax", "GST", true),
      money("total", "Total"),
    ],
    rows: out,
    totals: sumRows(out, ["taxable", "tax", "total"], { item: "Total" }),
    note: "Net of credit and debit notes. Lines typed without a catalogue item are grouped by description.",
  };
}

/* ---------------- Purchases ---------------- */

async function purchaseRegister(organizationId: string, p: ReportParams): Promise<ReportTable> {
  const today = todayInIndia();
  const statusSql =
    p.status === "unpaid"
      ? sql`and b.status = 'recorded'`
      : p.status === "partially_paid"
        ? sql`and b.status = 'partially_paid'`
        : p.status === "paid"
          ? sql`and b.status = 'paid'`
          : p.status === "overdue"
            ? sql`and b.status in ('recorded', 'partially_paid') and b.due_date < ${today}`
            : sql``;
  return withTenant(organizationId, async (tx) => {
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select b.id, b.number, b.supplier_bill_number, b.issue_date, b.due_date, b.status, b.party_name, b.party_gstin, b.reverse_charge,
        b.taxable_paise as taxable, b.cgst_paise as cgst, b.sgst_paise as sgst, b.igst_paise as igst, b.cess_paise as cess, b.total_paise as total
      from purchase_bills b
      where b.organization_id = ${organizationId} and b.number is not null and b.voided_at is null and b.issue_date between ${p.from} and ${p.to}
        ${p.supplierId ? sql`and b.supplier_id = ${p.supplierId}` : sql``} ${statusSql}
      order by b.issue_date, b.number
      limit ${ROW_CAP + 1}`);
    const shown = rows.slice(0, ROW_CAP);
    const balances = await billBalances(tx, organizationId, shown.map((r) => String(r.id)));
    const out: ReportRow[] = shown.map((r) => {
      const b = balances.get(String(r.id));
      const due = r.due_date ? iso(r.due_date) : null;
      return {
        _href: `/billing/purchase-bills/${r.id}`,
        number: String(r.number),
        supplierBill: (r.supplier_bill_number as string) ?? null,
        date: iso(r.issue_date),
        supplier: String(r.party_name ?? ""),
        gstin: (r.party_gstin as string) ?? null,
        ...taxCells(r),
        rcm: r.reverse_charge ? "Yes" : null,
        balance: b?.balancePaise ?? null,
        status: b && b.balancePaise > 0 && due && due < today ? "Overdue" : ({ recorded: "Unpaid", partially_paid: "Partly paid", paid: "Paid" } as Record<string, string>)[String(r.status)] ?? String(r.status),
      };
    });
    return {
      title: "Purchase summary",
      subtitle: await heading(organizationId, periodText(p)),
      columns: [
        { key: "number", label: "Bill", type: "text" },
        { key: "supplierBill", label: "Supplier's bill no.", type: "text", secondary: true },
        { key: "date", label: "Date", type: "date" },
        { key: "supplier", label: "Supplier", type: "text" },
        { key: "gstin", label: "GSTIN", type: "text", secondary: true },
        ...TAX_COLUMNS,
        money("total", "Total"),
        { key: "rcm", label: "Reverse charge", type: "text", secondary: true },
        money("balance", "Balance"),
        { key: "status", label: "Status", type: "text" },
      ],
      rows: out,
      totals: sumRows(out, ["taxable", "cgst", "sgst", "igst", "cess", "total", "balance"], { number: `Total (${out.length})` }),
      truncated: rows.length > ROW_CAP,
    };
  });
}

async function purchasesBySupplier(organizationId: string, p: ReportParams): Promise<ReportTable> {
  const payables = await payablesReport(organizationId);
  const owed = new Map(payables.suppliers.map((s) => [s.supplierId, s.totalPaise]));
  return withTenant(organizationId, async (tx) => {
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select s.party_id, sp.name, sp.gstin, ${SIGNED_SUMS}
      from (${signedDocs(PURCHASE_DOCS, organizationId, p, null)}) s
      join suppliers sp on sp.organization_id = ${organizationId} and sp.id = s.party_id
      group by s.party_id, sp.name, sp.gstin
      order by sum(sign * total_paise) desc, sp.name`);
    const out: ReportRow[] = rows.map((r) => ({
      _href: `/billing/suppliers/${r.party_id}`,
      supplier: String(r.name),
      gstin: (r.gstin as string) ?? null,
      bills: n(r.docs),
      ...taxCells(r),
      outstanding: owed.get(String(r.party_id)) ?? 0,
    }));
    return {
      title: "Supplier-wise purchases",
      subtitle: await heading(organizationId, periodText(p)),
      columns: [
        { key: "supplier", label: "Supplier", type: "text" },
        { key: "gstin", label: "GSTIN", type: "text", secondary: true },
        { key: "bills", label: "Bills", type: "number" },
        ...TAX_COLUMNS,
        money("total", "Net purchases"),
        money("outstanding", "You owe today"),
      ],
      rows: out,
      totals: sumRows(out, ["bills", "taxable", "cgst", "sgst", "igst", "cess", "total", "outstanding"], { supplier: "Total" }),
      note: "Net of purchase returns.",
    };
  });
}

async function purchaseReturns(organizationId: string, p: ReportParams): Promise<ReportTable> {
  return withTenant(organizationId, async (tx) => {
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select r.id, r.number, r.issue_date, r.party_name, r.reason, b.number as bill_number,
        r.taxable_paise as taxable, r.cgst_paise as cgst, r.sgst_paise as sgst, r.igst_paise as igst, r.cess_paise as cess, r.total_paise as total
      from purchase_returns r
      left join purchase_bills b on b.organization_id = r.organization_id and b.id = r.purchase_bill_id
      where r.organization_id = ${organizationId} and r.number is not null and r.voided_at is null and r.issue_date between ${p.from} and ${p.to}
        ${p.supplierId ? sql`and r.supplier_id = ${p.supplierId}` : sql``}
      order by r.issue_date, r.number
      limit ${ROW_CAP + 1}`);
    const out: ReportRow[] = rows.slice(0, ROW_CAP).map((r) => ({
      _href: `/billing/purchase-returns/${r.id}`,
      number: String(r.number),
      date: iso(r.issue_date),
      supplier: String(r.party_name ?? ""),
      bill: (r.bill_number as string) ?? null,
      reason: (r.reason as string) ?? null,
      ...taxCells(r),
    }));
    return {
      title: "Purchase returns",
      subtitle: await heading(organizationId, periodText(p)),
      columns: [
        { key: "number", label: "Return", type: "text" },
        { key: "date", label: "Date", type: "date" },
        { key: "supplier", label: "Supplier", type: "text" },
        { key: "bill", label: "Against bill", type: "text", secondary: true },
        { key: "reason", label: "Reason", type: "text", secondary: true },
        ...TAX_COLUMNS,
        money("total", "Total"),
      ],
      rows: out,
      totals: sumRows(out, ["taxable", "cgst", "sgst", "igst", "cess", "total"], { number: `Total (${out.length})` }),
      truncated: rows.length > ROW_CAP,
    };
  });
}

/* ---------------- Payments ---------------- */

async function paymentCollection(organizationId: string, p: ReportParams): Promise<ReportTable> {
  return withTenant(organizationId, async (tx) => {
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select pm.id, pm.number, pm.payment_date, pm.method, pm.reference, pm.amount_paise, c.name as customer,
        coalesce((select sum(a.amount_paise) from payment_allocations a where a.organization_id = pm.organization_id and a.payment_id = pm.id), 0) as allocated
      from business_payments pm
      join customers c on c.organization_id = pm.organization_id and c.id = pm.customer_id
      where pm.organization_id = ${organizationId} and pm.direction = 'received' and pm.voided_at is null
        and pm.payment_date between ${p.from} and ${p.to}
        ${p.customerId ? sql`and pm.customer_id = ${p.customerId}` : sql``}
      order by pm.payment_date, pm.number
      limit ${ROW_CAP + 1}`);
    const out: ReportRow[] = rows.slice(0, ROW_CAP).map((r) => ({
      _href: `/billing/payments/${r.id}`,
      number: String(r.number),
      date: iso(r.payment_date),
      customer: String(r.customer),
      method: methodLabel(String(r.method)),
      reference: (r.reference as string) ?? null,
      amount: n(r.amount_paise),
      advance: n(r.amount_paise) - n(r.allocated),
    }));
    // By method, for the note.
    const byMethod = new Map<string, number>();
    for (const r of out) byMethod.set(String(r.method), (byMethod.get(String(r.method)) ?? 0) + n(r.amount));
    return {
      title: "Payment collection",
      subtitle: await heading(organizationId, periodText(p)),
      columns: [
        { key: "number", label: "Receipt", type: "text" },
        { key: "date", label: "Date", type: "date" },
        { key: "customer", label: "Customer", type: "text" },
        { key: "method", label: "Method", type: "text" },
        { key: "reference", label: "Reference", type: "text", secondary: true },
        money("amount", "Amount"),
        money("advance", "Not yet applied", true),
      ],
      rows: out,
      totals: sumRows(out, ["amount", "advance"], { number: `Total (${out.length})` }),
      truncated: rows.length > ROW_CAP,
      note: byMethod.size ? `By method: ${[...byMethod].map(([m, v]) => `${m} ₹${(v / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`).join(", ")}.` : null,
    };
  });
}

const AGE_COLUMNS: Column[] = [money("current", "Not due"), money("d1_30", "1–30 days", true), money("d31_60", "31–60 days", true), money("d61_90", "61–90 days", true), money("d90_plus", "90+ days")];

async function customerOutstanding(organizationId: string, p: ReportParams): Promise<ReportTable> {
  const r = await outstandingReport(organizationId);
  const out: ReportRow[] = r.customers
    .filter((c) => !p.customerId || c.customerId === p.customerId)
    .map((c) => ({ _href: `/billing/customers/${c.customerId}`, customer: c.customerName, invoices: c.invoices, ...c.ageing, overdue: c.overduePaise, total: c.totalPaise, oldest: c.oldestDue }));
  return {
    title: "Customer outstanding",
    subtitle: await heading(organizationId, `as of ${fmtDay(r.today)}`),
    columns: [{ key: "customer", label: "Customer", type: "text" }, { key: "invoices", label: "Invoices", type: "number" }, ...AGE_COLUMNS, money("overdue", "Overdue"), money("total", "Total due"), { key: "oldest", label: "Oldest due date", type: "date", secondary: true }],
    rows: out,
    totals: sumRows(out, ["invoices", "current", "d1_30", "d31_60", "d61_90", "d90_plus", "overdue", "total"], { customer: "Total" }),
    note: "Ageing counts days past each invoice's due date (or its date, if it has none). Opening balances and advances aren't included.",
  };
}

async function supplierOutstanding(organizationId: string, p: ReportParams): Promise<ReportTable> {
  const r = await payablesReport(organizationId);
  const out: ReportRow[] = r.suppliers
    .filter((s) => !p.supplierId || s.supplierId === p.supplierId)
    .map((s) => ({ _href: `/billing/suppliers/${s.supplierId}`, supplier: s.supplierName, bills: s.bills, ...s.ageing, overdue: s.overduePaise, total: s.totalPaise }));
  return {
    title: "Supplier outstanding",
    subtitle: await heading(organizationId, `as of ${fmtDay(r.today)}`),
    columns: [{ key: "supplier", label: "Supplier", type: "text" }, { key: "bills", label: "Bills", type: "number" }, ...AGE_COLUMNS, money("overdue", "Overdue"), money("total", "Total owed")],
    rows: out,
    totals: sumRows(out, ["bills", "current", "d1_30", "d31_60", "d61_90", "d90_plus", "overdue", "total"], { supplier: "Total" }),
    note: "Ageing counts days past each bill's due date (or its date, if it has none). Opening balances aren't included.",
  };
}

const CASH_GROUPS: { label: string; sources: string[] }[] = [
  { label: "Receipts from customers", sources: ["payment_received"] },
  { label: "Refunds to customers", sources: ["refund"] },
  { label: "Payments to suppliers", sources: ["payment_made"] },
  { label: "Manual entries (expenses, capital, transfers)", sources: ["manual"] },
];

async function cashFlow(organizationId: string, p: ReportParams): Promise<ReportTable> {
  return withTenant(organizationId, async (tx) => {
    const base = sql`from journal_lines l
      join journal_entries e on e.organization_id = l.organization_id and e.id = l.entry_id
      join accounts a on a.organization_id = l.organization_id and a.id = l.account_id
      where l.organization_id = ${organizationId} and a.system_key in ('cash', 'bank')`;
    const { rows: open } = await tx.execute<{ net: string }>(sql`select coalesce(sum(l.debit_paise - l.credit_paise), 0) as net ${base} and e.entry_date < ${p.from}`);
    const { rows } = await tx.execute<{ st: string; inflow: string; outflow: string }>(sql`
      select e.source_type as st, coalesce(sum(l.debit_paise), 0) as inflow, coalesce(sum(l.credit_paise), 0) as outflow
      ${base} and e.entry_date between ${p.from} and ${p.to}
      group by e.source_type`);
    const opening = n(open[0]?.net);
    const known = new Set(CASH_GROUPS.flatMap((g) => g.sources));
    const groups = [...CASH_GROUPS, { label: "Other", sources: rows.map((r) => r.st).filter((s) => !known.has(s)) }];
    const lines: ReportRow[] = groups
      .map((g) => {
        const hit = rows.filter((r) => g.sources.includes(r.st));
        const inflow = hit.reduce((a, r) => a + n(r.inflow), 0);
        const outflow = hit.reduce((a, r) => a + n(r.outflow), 0);
        return { item: g.label, inflow, outflow, net: inflow - outflow };
      })
      .filter((r) => r.inflow || r.outflow);
    const inflow = lines.reduce((a, r) => a + n(r.inflow), 0);
    const outflow = lines.reduce((a, r) => a + n(r.outflow), 0);
    const out: ReportRow[] = [
      { item: `Cash and bank on ${fmtDay(p.from)}`, inflow: null, outflow: null, net: opening, _strong: 1 },
      ...lines,
      { item: "Net change", inflow, outflow, net: inflow - outflow, _strong: 1 },
      { item: `Cash and bank on ${fmtDay(p.to)}`, inflow: null, outflow: null, net: opening + inflow - outflow, _strong: 1 },
    ];
    return {
      title: "Cash flow",
      subtitle: await heading(organizationId, periodText(p)),
      columns: [{ key: "item", label: "", type: "text" }, money("inflow", "Money in"), money("outflow", "Money out"), money("net", "Net")],
      rows: out,
      totals: null,
      note: "From the Cash in hand and Bank accounts in your books. A voided payment and its reversal cancel out within the same line.",
    };
  });
}

/* ---------------- Tax ---------------- */

async function gstSummary(organizationId: string, p: ReportParams): Promise<ReportTable> {
  return withTenant(organizationId, async (tx) => {
    const query = (docs: DocTable[]) => sql`
      select x.sign, x.reverse_charge as rcm, x.tax_rate as rate,
        sum(x.taxable_paise) as taxable, sum(x.cgst_paise) as cgst, sum(x.sgst_paise) as sgst, sum(x.igst_paise) as igst, sum(x.cess_paise) as cess
      from (${signedItems(docs, organizationId, p, null)}) x
      group by x.sign, x.reverse_charge, x.tax_rate
      order by x.reverse_charge, x.sign desc, x.tax_rate`;
    const { rows: sales } = await tx.execute<Record<string, unknown>>(query(SALES_DOCS));
    const { rows: purchases } = await tx.execute<Record<string, unknown>>(query(PURCHASE_DOCS));
    const rateLabel = (r: unknown) => `${Number(r)}%`;
    const line = (section: string, r: Record<string, unknown>, sign: number): ReportRow => {
      const c = { taxable: sign * n(r.taxable), cgst: sign * n(r.cgst), sgst: sign * n(r.sgst), igst: sign * n(r.igst), cess: sign * n(r.cess) };
      return { section, rate: rateLabel(r.rate), ...c, tax: c.cgst + c.sgst + c.igst + c.cess };
    };
    const subtotal = (label: string, rs: ReportRow[], sign = 1): ReportRow => {
      const k = ["taxable", "cgst", "sgst", "igst", "cess", "tax"] as const;
      return { section: label, rate: null, ...Object.fromEntries(k.map((key) => [key, sign * rs.reduce((a, r) => a + n(r[key]), 0)])), _strong: 1 };
    };
    // Output: sales and debit notes add, credit notes subtract; reverse-charge sales carry no output tax for you.
    const output = sales.filter((r) => !r.rcm).map((r) => line(n(r.sign) > 0 ? "Sales" : "Credit notes (less)", r, n(r.sign)));
    const rcmSales = sales.filter((r) => r.rcm).map((r) => ({ ...line("Sales under reverse charge (buyer pays the tax)", r, n(r.sign)), cgst: 0, sgst: 0, igst: 0, cess: 0, tax: 0 }));
    // Input: bills add, returns subtract. Reverse-charge purchases are also tax you must pay.
    const input = purchases.map((r) => line(`${n(r.sign) > 0 ? "Purchases" : "Purchase returns (less)"}${r.rcm ? " — reverse charge" : ""}`, r, n(r.sign)));
    const rcmPayable = purchases.filter((r) => r.rcm).map((r) => line("Tax payable on reverse-charge purchases", r, n(r.sign)));
    const outTotal = subtotal("Output tax", [...output, ...rcmPayable]);
    const inTotal = subtotal("Input tax credit", input);
    const net: ReportRow = { section: "Net GST payable (output − input)", rate: null, taxable: null, cgst: n(outTotal.cgst) - n(inTotal.cgst), sgst: n(outTotal.sgst) - n(inTotal.sgst), igst: n(outTotal.igst) - n(inTotal.igst), cess: n(outTotal.cess) - n(inTotal.cess), tax: n(outTotal.tax) - n(inTotal.tax), _strong: 1 };
    const rows: ReportRow[] = [...output, ...rcmSales, ...rcmPayable, outTotal, ...input, inTotal, net];
    return {
      title: "GST summary",
      subtitle: await heading(organizationId, periodText(p)),
      columns: [{ key: "section", label: "", type: "text" }, { key: "rate", label: "Rate", type: "text" }, money("taxable", "Taxable value"), money("cgst", "CGST"), money("sgst", "SGST"), money("igst", "IGST"), money("cess", "Cess", true), money("tax", "Total tax")],
      rows,
      totals: null,
      note: "A working summary from your issued documents to help you prepare returns. Check it against your GST portal data before filing; a negative net figure is credit carried forward.",
    };
  });
}

async function hsnSummary(organizationId: string, p: ReportParams): Promise<ReportTable> {
  return withTenant(organizationId, async (tx) => {
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select coalesce(nullif(x.hsn_sac, ''), '—') as hsn, coalesce(x.unit_code, '') as unit, x.tax_rate as rate,
        min(x.description) as description, sum(x.sign * x.quantity) as qty, sum(x.sign * x.total_paise) as total,
        sum(x.sign * x.taxable_paise) as taxable, sum(x.sign * x.igst_paise) as igst, sum(x.sign * x.cgst_paise) as cgst, sum(x.sign * x.sgst_paise) as sgst, sum(x.sign * x.cess_paise) as cess
      from (${signedItems(SALES_DOCS, organizationId, p, null)}) x
      group by 1, 2, 3 order by 1, 3`);
    const out: ReportRow[] = rows.map((r) => ({
      hsn: String(r.hsn),
      description: (r.description as string) ?? null,
      unit: (r.unit as string) || null,
      qty: Math.round(n(r.qty) * 1000) / 1000,
      rate: `${Number(r.rate)}%`,
      total: n(r.total),
      taxable: n(r.taxable),
      igst: n(r.igst),
      cgst: n(r.cgst),
      sgst: n(r.sgst),
      cess: n(r.cess),
    }));
    return {
      title: "HSN/SAC summary of sales",
      subtitle: await heading(organizationId, periodText(p)),
      columns: [
        { key: "hsn", label: "HSN/SAC", type: "text" },
        { key: "description", label: "Description", type: "text", secondary: true },
        { key: "unit", label: "UQC", type: "text" },
        { key: "qty", label: "Quantity", type: "number" },
        { key: "rate", label: "Rate", type: "text" },
        money("total", "Total value", true),
        money("taxable", "Taxable value"),
        money("igst", "IGST"),
        money("cgst", "CGST"),
        money("sgst", "SGST"),
        money("cess", "Cess", true),
      ],
      rows: out,
      totals: sumRows(out, ["total", "taxable", "igst", "cgst", "sgst", "cess"], { hsn: "Total" }),
      note: "Net of credit and debit notes. Lines without an HSN/SAC code are shown as —.",
    };
  });
}

/* ---------------- Inventory ---------------- */

const STATUS_TEXT: Record<StockStatus, string> = { ok: "In stock", low: "Low", out: "Out of stock", negative: "Below zero" };
const KIND_TEXT: Record<string, string> = {
  purchase: "Purchase",
  purchase_return: "Purchase return",
  sale: "Sale",
  sales_return: "Sales return",
  adjustment: "Adjustment",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
};

async function warehouseName(organizationId: string, warehouseId: string | null) {
  if (!warehouseId) return "All warehouses";
  const w = (await listWarehouses(organizationId, { includeArchived: true })).find((x) => x.id === warehouseId);
  return w?.name ?? "Unknown warehouse";
}

async function stockSummaryTable(organizationId: string, p: ReportParams, lowOnly = false): Promise<ReportTable> {
  const s = await stockSummary(organizationId, { q: null, warehouseId: p.warehouseId, asOf: lowOnly ? null : p.asOf, status: lowOnly ? "attention" : "all", page: 1, pageSize: ROW_CAP });
  const rows: ReportRow[] = s.items.map((i) => ({
    _href: `/billing/stock/${i.id}`,
    product: i.name,
    sku: i.sku,
    unit: i.unit,
    qty: i.onHandMilli / 1000,
    min: i.minStockMilli === null ? null : i.minStockMilli / 1000,
    avgCost: Math.round(i.avgCostPaise),
    value: i.valuePaise,
    status: STATUS_TEXT[i.status],
  }));
  const where = await warehouseName(organizationId, p.warehouseId);
  return {
    title: lowOnly ? "Low stock" : "Stock summary and valuation",
    subtitle: await heading(organizationId, lowOnly ? `${where} · today` : `${where} · as of ${fmtDay(p.asOf)}`),
    columns: [
      { key: "product", label: "Product", type: "text" },
      { key: "sku", label: "SKU", type: "text", secondary: true },
      { key: "qty", label: "On hand", type: "number" },
      { key: "unit", label: "Unit", type: "text", secondary: true },
      { key: "min", label: "Minimum", type: "number", secondary: true },
      money("avgCost", "Average cost", true),
      money("value", "Stock value"),
      { key: "status", label: "Status", type: "text" },
    ],
    rows,
    totals: lowOnly ? null : sumRows(rows, ["value"], { product: `Total (${rows.length} products)` }),
    note: lowOnly
      ? "Products that track stock and are below their minimum, out of stock or below zero (across all warehouses)."
      : "Weighted average cost: what you paid (before GST) spread over the quantity bought. One warehouse's value uses the company-wide average.",
  };
}

async function stockMovementsTable(organizationId: string, p: ReportParams): Promise<ReportTable> {
  return withTenant(organizationId, async (tx) => {
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select m.movement_date, m.kind, m.quantity, m.value_paise, m.reverses_movement_id, m.source_type, m.source_id, m.product_id,
        p.name as product, w.name as warehouse,
        coalesce(i.number, cn.number, pb.number, pr.number, sa.number) as source_number
      from stock_movements m
      join products p on p.organization_id = m.organization_id and p.id = m.product_id
      join warehouses w on w.organization_id = m.organization_id and w.id = m.warehouse_id
      left join business_invoices i on m.source_type = 'document:invoices' and i.organization_id = m.organization_id and i.id = m.source_id
      left join credit_notes cn on m.source_type = 'document:credit-notes' and cn.organization_id = m.organization_id and cn.id = m.source_id
      left join purchase_bills pb on m.source_type = 'document:purchase-bills' and pb.organization_id = m.organization_id and pb.id = m.source_id
      left join purchase_returns pr on m.source_type = 'document:purchase-returns' and pr.organization_id = m.organization_id and pr.id = m.source_id
      left join stock_adjustments sa on m.source_type = 'stock_adjustment' and sa.organization_id = m.organization_id and sa.id = m.source_id
      where m.organization_id = ${organizationId} and m.movement_date between ${p.from} and ${p.to}
        ${p.warehouseId ? sql`and m.warehouse_id = ${p.warehouseId}` : sql``}
        ${p.productId ? sql`and m.product_id = ${p.productId}` : sql``}
      order by m.movement_date, m.created_at, m.id
      limit ${ROW_CAP + 1}`);
    const href = (type: string, id: string) => (type === "stock_adjustment" ? `/billing/stock-adjustments/${id}` : type.startsWith("document:") ? `/billing/${type.slice(9)}/${id}` : null);
    const out: ReportRow[] = rows.slice(0, ROW_CAP).map((r) => {
      const q = Number(r.quantity);
      return {
        _href: href(String(r.source_type), String(r.source_id)),
        reference: (r.source_number as string) ?? "—",
        date: iso(r.movement_date),
        product: String(r.product),
        warehouse: String(r.warehouse),
        kind: `${KIND_TEXT[String(r.kind)] ?? String(r.kind)}${r.reverses_movement_id ? " (void)" : ""}`,
        in: q > 0 ? q : null,
        out: q < 0 ? -q : null,
        value: n(r.value_paise),
      };
    });
    return {
      title: "Stock movements",
      subtitle: await heading(organizationId, `${await warehouseName(organizationId, p.warehouseId)} · ${periodText(p)}`),
      columns: [
        { key: "reference", label: "Reference", type: "text" },
        { key: "date", label: "Date", type: "date" },
        { key: "product", label: "Product", type: "text" },
        { key: "warehouse", label: "Warehouse", type: "text", secondary: true },
        { key: "kind", label: "Type", type: "text" },
        { key: "in", label: "In", type: "number" },
        { key: "out", label: "Out", type: "number" },
        money("value", "Value change", true),
      ],
      rows: out,
      totals: p.productId ? sumRows(out, ["in", "out", "value"], { reference: "Total" }) : sumRows(out, ["value"], { reference: `Total (${out.length})` }),
      truncated: rows.length > ROW_CAP,
      note: "Voids show as a separate movement marked (void); the original stays.",
    };
  });
}

/* ---------------- Accounting statements (exports) ---------------- */

async function trialBalanceTable(organizationId: string, p: ReportParams): Promise<ReportTable> {
  const tb = await trialBalance(organizationId, p.asOf);
  const rows: ReportRow[] = tb.rows.map((r) => ({ code: r.code, account: r.name, type: ACCOUNT_TYPE_LABELS[r.type], debit: r.debitPaise || null, credit: r.creditPaise || null }));
  return {
    title: "Trial balance",
    subtitle: await heading(organizationId, `as of ${fmtDay(p.asOf)}`),
    columns: [{ key: "code", label: "Code", type: "text" }, { key: "account", label: "Account", type: "text" }, { key: "type", label: "Type", type: "text" }, money("debit", "Debit"), money("credit", "Credit")],
    rows,
    totals: { code: "Total", debit: tb.debitPaise, credit: tb.creditPaise },
  };
}

async function profitLossTable(organizationId: string, p: ReportParams): Promise<ReportTable> {
  const pl = await profitAndLoss(organizationId, { from: p.from, to: p.to });
  const rows: ReportRow[] = [
    ...pl.income.lines.map((l) => ({ section: "Income", code: l.code, account: l.name, amount: l.amountPaise })),
    { section: "Total income", code: null, account: null, amount: pl.income.totalPaise, _strong: 1 },
    ...pl.expenses.lines.map((l) => ({ section: "Expenses", code: l.code, account: l.name, amount: l.amountPaise })),
    { section: "Total expenses", code: null, account: null, amount: pl.expenses.totalPaise, _strong: 1 },
    { section: pl.netProfitPaise >= 0 ? "Net profit" : "Net loss", code: null, account: null, amount: pl.netProfitPaise, _strong: 1 },
  ];
  return {
    title: "Profit and loss",
    subtitle: await heading(organizationId, periodText(p)),
    columns: [{ key: "section", label: "", type: "text" }, { key: "code", label: "Code", type: "text" }, { key: "account", label: "Account", type: "text" }, money("amount", "Amount")],
    rows,
    totals: null,
  };
}

async function balanceSheetTable(organizationId: string, p: ReportParams): Promise<ReportTable> {
  const bs = await balanceSheet(organizationId, p.asOf);
  const sec = (name: string, s: { lines: { code: string; name: string; amountPaise: number }[] }) => s.lines.map((l) => ({ section: name, code: l.code, account: l.name, amount: l.amountPaise }));
  const rows: ReportRow[] = [
    ...sec("Assets", bs.assets),
    { section: "Total assets", code: null, account: null, amount: bs.assets.totalPaise, _strong: 1 },
    ...sec("Liabilities", bs.liabilities),
    { section: "Total liabilities", code: null, account: null, amount: bs.liabilities.totalPaise, _strong: 1 },
    ...sec("Equity", bs.equity),
    ...(bs.equity.retainedPaise ? [{ section: "Equity", code: null, account: "Profit from earlier years", amount: bs.equity.retainedPaise }] : []),
    { section: "Equity", code: null, account: `Profit this year (${bs.financialYear.label}) to date`, amount: bs.equity.currentProfitPaise },
    { section: "Total equity", code: null, account: null, amount: bs.equity.totalPaise, _strong: 1 },
    { section: "Liabilities and equity", code: null, account: null, amount: bs.liabilitiesAndEquityPaise, _strong: 1 },
  ];
  return {
    title: "Balance sheet",
    subtitle: await heading(organizationId, `as of ${fmtDay(p.asOf)}`),
    columns: [{ key: "section", label: "", type: "text" }, { key: "code", label: "Code", type: "text" }, { key: "account", label: "Account", type: "text" }, money("amount", "Amount")],
    rows,
    totals: null,
  };
}

/* ---------------- Entry point ---------------- */

const BUILDERS: Record<string, (organizationId: string, p: ReportParams) => Promise<ReportTable>> = {
  "sales-register": salesRegister,
  "sales-by-period": salesByPeriod,
  "sales-by-customer": salesByCustomer,
  "sales-by-item": salesByItem,
  "purchase-register": purchaseRegister,
  "purchases-by-supplier": purchasesBySupplier,
  "purchase-returns": purchaseReturns,
  "payment-collection": paymentCollection,
  "customer-outstanding": customerOutstanding,
  "supplier-outstanding": supplierOutstanding,
  "cash-flow": cashFlow,
  "gst-summary": gstSummary,
  "hsn-summary": hsnSummary,
  "stock-summary": (o, p) => stockSummaryTable(o, p),
  "stock-movements": stockMovementsTable,
  "low-stock": (o, p) => stockSummaryTable(o, p, true),
  "trial-balance": trialBalanceTable,
  "profit-loss": profitLossTable,
  "balance-sheet": balanceSheetTable,
};

export async function runReport(organizationId: string, id: string, p: ReportParams): Promise<ReportTable> {
  const build = BUILDERS[id];
  if (!build) invalid({ report: "There's no such report." }, "There's no such report.");
  return build(organizationId, p);
}

export const reportIds = () => Object.keys(BUILDERS);
