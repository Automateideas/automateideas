import { sql } from "drizzle-orm";

import { type TenantTx } from "../tenant-db";

// What each invoice still owes, and the invoice's payment status.
//
//   balance = invoice total
//           + issued debit notes against it
//           − issued credit notes against it
//           − amounts allocated to it from recorded payments
//           + refunds paid out of its credit notes
//
// A negative balance means the customer has been credited more than they
// paid for; that excess can be refunded from the credit note.
// Raw SQL with fully qualified columns, so subqueries never match the wrong table.

export type InvoiceBalance = {
  id: string;
  number: string | null;
  status: string;
  customerId: string;
  issueDate: string;
  dueDate: string | null;
  totalPaise: number;
  debitedPaise: number;
  creditedPaise: number;
  paidPaise: number;
  creditRefundedPaise: number;
  balancePaise: number;
};

const balanceSelect = (organizationId: string) => sql`
  select i.id, i.number, i.status, i.customer_id, i.issue_date::text as issue_date, i.due_date::text as due_date, i.total_paise,
    coalesce((select sum(d.total_paise) from debit_notes d
      where d.organization_id = ${organizationId} and d.invoice_id = i.id and d.status = 'issued'), 0) as debited,
    coalesce((select sum(c.total_paise) from credit_notes c
      where c.organization_id = ${organizationId} and c.invoice_id = i.id and c.status = 'issued'), 0) as credited,
    coalesce((select sum(a.amount_paise) from payment_allocations a
      join business_payments p on p.organization_id = a.organization_id and p.id = a.payment_id
      where a.organization_id = ${organizationId} and a.invoice_id = i.id and p.status = 'recorded'), 0) as paid,
    coalesce((select sum(r.amount_paise) from refunds r
      join credit_notes c2 on c2.organization_id = r.organization_id and c2.id = r.credit_note_id
      where r.organization_id = ${organizationId} and c2.invoice_id = i.id and r.status = 'recorded'), 0) as credit_refunded
  from business_invoices i
  where i.organization_id = ${organizationId}`;

type Row = {
  id: string;
  number: string | null;
  status: string;
  customer_id: string;
  issue_date: string;
  due_date: string | null;
  total_paise: string | number;
  debited: string | number;
  credited: string | number;
  paid: string | number;
  credit_refunded: string | number;
};

function toBalance(r: Row): InvoiceBalance {
  const total = Number(r.total_paise);
  const debited = Number(r.debited);
  const credited = Number(r.credited);
  const paid = Number(r.paid);
  const creditRefunded = Number(r.credit_refunded);
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    customerId: r.customer_id,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    totalPaise: total,
    debitedPaise: debited,
    creditedPaise: credited,
    paidPaise: paid,
    creditRefundedPaise: creditRefunded,
    balancePaise: total + debited - credited - paid + creditRefunded,
  };
}

/** Balances of the given invoices (any status). */
export async function invoiceBalances(tx: TenantTx, organizationId: string, ids: string[]): Promise<Map<string, InvoiceBalance>> {
  if (!ids.length) return new Map();
  const { rows } = await tx.execute<Row>(sql`${balanceSelect(organizationId)} and i.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(rows.map((r) => [r.id, toBalance(r)]));
}

/** Issued invoices of a customer (or all customers) that still owe something, oldest first. */
export async function openInvoices(tx: TenantTx, organizationId: string, customerId?: string | null): Promise<InvoiceBalance[]> {
  const { rows } = await tx.execute<Row>(sql`
    select * from (${balanceSelect(organizationId)}
      and i.status in ('issued', 'partially_paid', 'paid')
      ${customerId ? sql`and i.customer_id = ${customerId}` : sql``}) b
    where b.total_paise + b.debited - b.credited - b.paid + b.credit_refunded > 0
    order by b.issue_date, b.number`);
  return rows.map(toBalance);
}

/** Invoice payment status from its balance: paid, partly paid (something settled) or issued. */
export function statusFor(b: InvoiceBalance): string {
  if (b.balancePaise <= 0) return "paid";
  if (b.paidPaise > 0 || b.creditedPaise > 0) return "partially_paid";
  return "issued";
}

/** Recomputes and stores an issued invoice's payment status (drafts and voids are left alone). */
export async function refreshInvoiceStatus(tx: TenantTx, organizationId: string, invoiceId: string | null | undefined) {
  if (!invoiceId) return;
  const b = (await invoiceBalances(tx, organizationId, [invoiceId])).get(invoiceId);
  if (!b || !["issued", "partially_paid", "paid"].includes(b.status)) return;
  const next = statusFor(b);
  if (next !== b.status) {
    await tx.execute(sql`update business_invoices set status = ${next}, updated_at = now() where organization_id = ${organizationId} and id = ${invoiceId}`);
  }
}
