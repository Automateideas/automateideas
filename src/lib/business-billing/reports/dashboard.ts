import { sql } from "drizzle-orm";

import { todayInIndia } from "../documents/types";
import { lowStock } from "../inventory/service";
import { payablesReport } from "../payments/supplier-payments";
import { outstandingReport } from "../payments/service";
import { withTenant } from "../tenant-db";
import { PURCHASE_DOCS, SALES_DOCS, itemSummary, signedDocs, signedItems } from "./service";

// The /billing dashboard: headline numbers, trends and short lists for a
// period (and optionally one customer). Tenant-scoped like everything else.

const n = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : String(v ?? "").slice(0, 10));

/** Months from `from` to `to` as YYYY-MM, at most the last 24. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.slice(-24);
}

export type Dashboard = Awaited<ReturnType<typeof billingDashboard>>;

export async function billingDashboard(organizationId: string, p: { from: string; to: string; customerId: string | null }) {
  const today = todayInIndia();
  const [receivables, payables, low] = await Promise.all([outstandingReport(organizationId, today), payablesReport(organizationId, today), lowStock(organizationId, 5)]);
  const items = await itemSummary(organizationId, { ...p, asOf: p.to, groupBy: "month", supplierId: null, warehouseId: null, productId: null, status: null }, SALES_DOCS, p.customerId);

  const data = await withTenant(organizationId, async (tx) => {
    const sums = async (docs: typeof SALES_DOCS, partyId: string | null) => {
      const { rows } = await tx.execute<Record<string, unknown>>(sql`
        select count(*) filter (where sign = 1 and kind in ('invoice', 'bill')) as docs,
          coalesce(sum(sign * total_paise), 0) as total, coalesce(sum(sign * taxable_paise), 0) as taxable
        from (${signedDocs(docs, organizationId, p, partyId)}) s`);
      return { docs: n(rows[0]?.docs), total: n(rows[0]?.total), taxable: n(rows[0]?.taxable) };
    };
    const sales = await sums(SALES_DOCS, p.customerId);
    const purchases = await sums(PURCHASE_DOCS, null);

    const { rows: collected } = await tx.execute<{ month: string; total: string }>(sql`
      select to_char(pm.payment_date, 'YYYY-MM') as month, sum(pm.amount_paise) as total
      from business_payments pm
      where pm.organization_id = ${organizationId} and pm.direction = 'received' and pm.voided_at is null
        and pm.payment_date between ${p.from} and ${p.to} ${p.customerId ? sql`and pm.customer_id = ${p.customerId}` : sql``}
      group by 1`);
    const { rows: salesByMonth } = await tx.execute<{ month: string; total: string }>(sql`
      select to_char(s.issue_date, 'YYYY-MM') as month, sum(s.sign * s.total_paise) as total
      from (${signedDocs(SALES_DOCS, organizationId, p, p.customerId)}) s group by 1`);

    const { rows: top } = await tx.execute<{ id: string; name: string; total: string }>(sql`
      select s.party_id as id, c.name, sum(s.sign * s.total_paise) as total
      from (${signedDocs(SALES_DOCS, organizationId, p, null)}) s
      join customers c on c.organization_id = ${organizationId} and c.id = s.party_id
      group by s.party_id, c.name having sum(s.sign * s.total_paise) > 0
      order by 3 desc limit 5`);

    // Tax: output on sales (not reverse charge) plus reverse-charge purchases; input on purchases.
    const taxOf = async (docs: typeof SALES_DOCS, filter: ReturnType<typeof sql>) => {
      const { rows } = await tx.execute<Record<string, unknown>>(sql`
        select coalesce(sum(x.sign * x.cgst_paise), 0) as cgst, coalesce(sum(x.sign * x.sgst_paise), 0) as sgst,
          coalesce(sum(x.sign * x.igst_paise), 0) as igst, coalesce(sum(x.sign * x.cess_paise), 0) as cess
        from (${signedItems(docs, organizationId, p, null)}) x where ${filter}`);
      const r = rows[0] ?? {};
      return { cgst: n(r.cgst), sgst: n(r.sgst), igst: n(r.igst), cess: n(r.cess) };
    };
    const outSales = await taxOf(SALES_DOCS, sql`not x.reverse_charge`);
    const rcm = await taxOf(PURCHASE_DOCS, sql`x.reverse_charge`);
    const input = await taxOf(PURCHASE_DOCS, sql`true`);
    const output = { cgst: outSales.cgst + rcm.cgst, sgst: outSales.sgst + rcm.sgst, igst: outSales.igst + rcm.igst, cess: outSales.cess + rcm.cess };

    // Latest activity: issued sales and purchase documents, and payments both ways.
    const cust = p.customerId;
    const { rows: recent } = await tx.execute<Record<string, unknown>>(sql`
      select * from (
        select 'invoice' as kind, i.id, i.number, i.issue_date as date, i.party_name as party, i.total_paise as amount, i.issued_at as at
        from business_invoices i where i.organization_id = ${organizationId} and i.number is not null and i.voided_at is null ${cust ? sql`and i.customer_id = ${cust}` : sql``}
        union all
        select 'payment', pm.id, pm.number, pm.payment_date, c.name, pm.amount_paise, pm.created_at
        from business_payments pm join customers c on c.organization_id = pm.organization_id and c.id = pm.customer_id
        where pm.organization_id = ${organizationId} and pm.direction = 'received' and pm.voided_at is null ${cust ? sql`and pm.customer_id = ${cust}` : sql``}
        ${
          cust
            ? sql``
            : sql`union all
        select 'bill', b.id, b.number, b.issue_date, b.party_name, b.total_paise, b.issued_at
        from purchase_bills b where b.organization_id = ${organizationId} and b.number is not null and b.voided_at is null
        union all
        select 'supplier_payment', pm.id, pm.number, pm.payment_date, s.name, pm.amount_paise, pm.created_at
        from business_payments pm join suppliers s on s.organization_id = pm.organization_id and s.id = pm.supplier_id
        where pm.organization_id = ${organizationId} and pm.direction = 'made' and pm.voided_at is null`
        }
      ) t order by t.at desc nulls last limit 8`);

    return { sales, purchases, collected, salesByMonth, top, output, input, recent };
  });

  const collectedBy = new Map(data.collected.map((r) => [r.month, n(r.total)]));
  const salesBy = new Map(data.salesByMonth.map((r) => [r.month, n(r.total)]));
  const months = monthsBetween(p.from, p.to);
  const customerRows = p.customerId ? receivables.customers.filter((c) => c.customerId === p.customerId) : receivables.customers;
  const tax = (t: { cgst: number; sgst: number; igst: number; cess: number }) => ({ ...t, totalPaise: t.cgst + t.sgst + t.igst + t.cess });
  const HREF: Record<string, (id: string) => string> = {
    invoice: (id) => `/billing/invoices/${id}`,
    payment: (id) => `/billing/payments/${id}`,
    bill: (id) => `/billing/purchase-bills/${id}`,
    supplier_payment: (id) => `/billing/supplier-payments/${id}`,
  };

  return {
    period: { from: p.from, to: p.to },
    today,
    kpis: {
      salesPaise: data.sales.total,
      invoices: data.sales.docs,
      purchasesPaise: p.customerId ? null : data.purchases.total,
      collectedPaise: [...collectedBy.values()].reduce((a, v) => a + v, 0),
      outstandingPaise: customerRows.reduce((a, c) => a + c.totalPaise, 0),
      overduePaise: customerRows.reduce((a, c) => a + c.overduePaise, 0),
      payablePaise: p.customerId ? null : payables.totals.totalPaise,
    },
    monthly: months.map((m) => ({ month: m, salesPaise: salesBy.get(m) ?? 0, collectedPaise: collectedBy.get(m) ?? 0 })),
    topCustomers: p.customerId ? [] : data.top.map((r) => ({ id: r.id, name: r.name, salesPaise: n(r.total) })),
    topItems: items.slice(0, 5).filter((r) => n(r.taxable) > 0).map((r) => ({ name: String(r.name ?? ""), quantity: Math.round(n(r.qty) * 1000) / 1000, unit: (r.unit as string) ?? null, salesPaise: n(r.taxable) })),
    // Products that track stock and are below their minimum or out of stock (company-wide, today).
    lowStock: p.customerId ? null : { total: low.total, items: low.items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, onHandMilli: i.onHandMilli, minStockMilli: i.minStockMilli, status: i.status })) },
    tax: p.customerId ? null : { output: tax(data.output), input: tax(data.input), netPaise: tax(data.output).totalPaise - tax(data.input).totalPaise },
    recent: data.recent.map((r) => ({ kind: String(r.kind), id: String(r.id), number: (r.number as string) ?? null, date: iso(r.date), party: (r.party as string) ?? "", amountPaise: n(r.amount), href: HREF[String(r.kind)](String(r.id)) })),
  };
}
