import { APIError } from "better-auth/api";
import { type AnyColumn, type SQL, and, asc, count, desc, eq, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";

import {
  billingSettings,
  businessInvoiceItems,
  businessInvoices,
  businessPayments,
  creditNoteItems,
  creditNotes,
  customerAddresses,
  customers,
  debitNoteItems,
  debitNotes,
  organization,
  paymentAllocations,
  products,
  purchaseBillItems,
  purchaseBills,
  purchaseOrderItems,
  purchaseOrders,
  purchaseReturnItems,
  purchaseReturns,
  quotationItems,
  quotations,
  salesOrderItems,
  salesOrders,
  services,
  suppliers,
} from "@/db/schema";

import { type AddressValues, stateByCode } from "../fields";
import { allocateDocumentNumber } from "../numbering";
import { billBalances, invoiceBalances, refreshBillStatus, refreshInvoiceStatus } from "../payments/balances";
import { type ListQuery, conflict, invalid, notFound, paged, searchFilter, uniqueViolation } from "../records";
import { type DocumentTaxInput, type DocumentTaxResult, OUTSIDE_INDIA, TaxInputError, calculateGst } from "../tax/gst";
import { type SellerTaxProfile, sellerTaxProfile } from "../tax-settings";
import { type TenantTx, withTenant } from "../tenant-db";
import { DOCUMENT_TYPES, type DocumentSlug, QUOTATION_RESPONSES, displayStatus, todayInIndia } from "./types";
import type { DocumentLineValues, DocumentValues } from "./validation";

// Sales documents (quotations, sales orders, invoices, credit and debit notes)
// and purchase documents (purchase orders, purchase bills, purchase returns).
//
// - Drafts can be edited and deleted. Totals are always recalculated here by
//   the GST engine; the browser's numbers are never stored.
// - Issuing (one transaction): recalculates, takes the next number for the
//   document's financial year, copies the company's and the party's details
//   as they are now, and locks the document. Database triggers
//   (drizzle/*_lock_issued_documents, *_purchases_rls_and_locks) refuse any
//   later change except status and voiding, and refuse deleting it.
// - Mistakes are fixed by voiding (keeps the number) or with notes/returns.
// - Sales: you are the seller; the place of supply is the customer's.
//   Purchases: the supplier is the seller; the place of supply is yours.
// Every query filters by organization_id and runs under row-level security.

/* ---------------- Table registry ---------------- */

// The tables share their columns (documentColumns/itemColumns/partySnapshot
// in the schema), so one typed view of the invoice tables serves all of them.
type DocTable = typeof businessInvoices;
type ItemTable = typeof businessInvoiceItems;

const REGISTRY = {
  invoices: { table: businessInvoices, items: businessInvoiceItems, parentKey: "invoiceId", extraKey: "dueDate", partyKey: "customerId", sourceKey: null },
  quotations: { table: quotations, items: quotationItems, parentKey: "quotationId", extraKey: "validUntil", partyKey: "customerId", sourceKey: null },
  "sales-orders": { table: salesOrders, items: salesOrderItems, parentKey: "salesOrderId", extraKey: "expectedDate", partyKey: "customerId", sourceKey: null },
  "credit-notes": { table: creditNotes, items: creditNoteItems, parentKey: "creditNoteId", extraKey: null, partyKey: "customerId", sourceKey: "invoiceId" },
  "debit-notes": { table: debitNotes, items: debitNoteItems, parentKey: "debitNoteId", extraKey: null, partyKey: "customerId", sourceKey: "invoiceId" },
  "purchase-orders": { table: purchaseOrders, items: purchaseOrderItems, parentKey: "purchaseOrderId", extraKey: "expectedDate", partyKey: "supplierId", sourceKey: null },
  "purchase-bills": { table: purchaseBills, items: purchaseBillItems, parentKey: "purchaseBillId", extraKey: "dueDate", partyKey: "supplierId", sourceKey: null },
  "purchase-returns": { table: purchaseReturns, items: purchaseReturnItems, parentKey: "purchaseReturnId", extraKey: null, partyKey: "supplierId", sourceKey: "purchaseBillId" },
} as const;

function reg(slug: DocumentSlug) {
  const r = REGISTRY[slug];
  const table = r.table as unknown as DocTable;
  const items = r.items as unknown as ItemTable;
  const cols = r.table as unknown as Record<string, AnyColumn>;
  const itemCols = r.items as unknown as Record<string, AnyColumn>;
  return {
    table,
    items,
    parentCol: itemCols[r.parentKey],
    parentKey: r.parentKey,
    extraCol: r.extraKey ? cols[r.extraKey] : null,
    extraKey: r.extraKey,
    partyKey: r.partyKey,
    partyCol: cols[r.partyKey],
    sourceKey: r.sourceKey,
  };
}

/** Statuses at which a document counts (issued and not void), per type. */
const LIVE: Record<DocumentSlug, readonly string[]> = {
  invoices: ["issued", "partially_paid", "paid"],
  quotations: ["sent", "accepted", "declined", "converted"],
  "sales-orders": ["confirmed", "fulfilled", "invoiced"],
  "credit-notes": ["issued"],
  "debit-notes": ["issued"],
  "purchase-orders": ["sent", "received", "billed"],
  "purchase-bills": ["recorded", "partially_paid", "paid"],
  "purchase-returns": ["issued"],
};

/* ---------------- Errors ---------------- */

const locked = (what: string): never =>
  conflict("DOCUMENT_LOCKED", `This ${what.toLowerCase()} is issued and locked. Void it, or adjust it with a note or return instead.`);

/** The lock trigger's error (hint DOCUMENT_LOCKED) as a 409, and duplicate supplier bill numbers as a field error. */
async function guardLock<T>(fn: () => Promise<T>, what: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    for (let x = e as { hint?: string; cause?: unknown } | undefined, i = 0; x && i < 4; i++) {
      if (x.hint === "DOCUMENT_LOCKED") locked(what);
      x = x.cause as typeof x;
    }
    if (uniqueViolation(e) === "purchase_bills_supplier_number_uq") {
      conflict("DUPLICATE", "You've already entered this supplier bill.", { partyReference: "This supplier bill number is already recorded." });
    }
    throw e;
  }
}

/* ---------------- Parties (customers, suppliers) and your company ---------------- */

type Party = {
  id: string;
  name: string;
  gstin: string | null;
  archivedAt: Date | null;
  billing: AddressValues | null;
  shipping: AddressValues | null;
  /** Customers: GST state code of the place of supply. */
  placeOfSupply: string | null;
  /** Suppliers: their GST state (from the GSTIN, else the address). */
  stateCode: string | null;
  paymentTermsDays: number | null;
  priceListId: string | null;
};

async function loadParty(tx: TenantTx, organizationId: string, slug: DocumentSlug, id: string): Promise<Party> {
  if (DOCUMENT_TYPES[slug].party === "supplier") {
    const [s] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.organizationId, organizationId), eq(suppliers.id, id)));
    if (!s) invalid({ supplierId: "Choose a supplier." });
    const address: AddressValues = { addressLine1: s.addressLine1, addressLine2: s.addressLine2, city: s.city, state: s.state, stateCode: s.stateCode, postalCode: s.postalCode, countryCode: s.countryCode };
    return {
      id: s.id,
      name: s.name,
      gstin: s.gstin,
      archivedAt: s.archivedAt,
      billing: address,
      shipping: null,
      placeOfSupply: null,
      stateCode: s.gstin ? s.gstin.slice(0, 2) : s.countryCode === "IN" ? s.stateCode : null,
      paymentTermsDays: s.paymentTermsDays,
      priceListId: null,
    };
  }
  const [c] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, organizationId), eq(customers.id, id)));
  if (!c) invalid({ customerId: "Choose a customer." });
  const addresses = await tx
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.organizationId, organizationId), eq(customerAddresses.customerId, id), eq(customerAddresses.isDefault, true)));
  const addr = (type: string): AddressValues | null => {
    const a = addresses.find((x) => x.type === type);
    return a
      ? { addressLine1: a.addressLine1, addressLine2: a.addressLine2, city: a.city, state: a.state, stateCode: a.stateCode, postalCode: a.postalCode, countryCode: a.countryCode }
      : null;
  };
  return {
    id: c.id,
    name: c.name,
    gstin: c.gstin,
    archivedAt: c.archivedAt,
    billing: addr("billing"),
    shipping: addr("shipping"),
    placeOfSupply: c.placeOfSupply,
    stateCode: c.placeOfSupply,
    paymentTermsDays: c.paymentTermsDays,
    priceListId: c.priceListId,
  };
}

/**
 * Default place of supply. Sales: where goods are delivered, else the
 * customer's state; "96" abroad. Purchases: your own state (you receive them).
 */
function defaultPlaceOfSupply(slug: DocumentSlug, p: Party, company: SellerTaxProfile): string | null {
  if (DOCUMENT_TYPES[slug].party === "supplier") return company.stateCode;
  const ship = p.shipping ?? p.billing;
  if (ship && ship.countryCode !== "IN") return OUTSIDE_INDIA;
  return p.shipping?.stateCode ?? p.placeOfSupply ?? p.billing?.stateCode ?? null;
}

const partySnapshot = (p: Party) => ({
  partyName: p.name,
  partyGstin: p.gstin,
  billingAddress: p.billing,
  shippingAddress: p.shipping ?? p.billing,
});

async function sellerSnapshot(tx: TenantTx, organizationId: string) {
  const [s] = await tx.select().from(billingSettings).where(eq(billingSettings.organizationId, organizationId));
  const [org] = await tx.select({ name: organization.name }).from(organization).where(eq(organization.id, organizationId));
  if (!s) return null;
  const stateCode = s.gstin ? s.gstin.slice(0, 2) : s.stateCode;
  return {
    legalName: s.legalName,
    tradeName: s.tradeName ?? (org?.name !== s.legalName ? org?.name : null) ?? null,
    gstin: s.gstin,
    pan: s.pan,
    email: s.email,
    phone: s.phone,
    addressLine1: s.addressLine1,
    addressLine2: s.addressLine2,
    city: s.city,
    state: stateByCode(stateCode)?.name ?? s.state,
    stateCode,
    postalCode: s.postalCode,
    countryCode: s.countryCode,
  };
}

/** Your company's details (the seller on sales, the buyer on purchases). Stored as `seller` on every document. */
export type SellerSnapshot = NonNullable<Awaited<ReturnType<typeof sellerSnapshot>>>;

/** The company's current details (what drafts show; issued documents keep their own copy). */
export async function currentSeller(organizationId: string) {
  return withTenant(organizationId, (tx) => sellerSnapshot(tx, organizationId));
}

async function requireCompany(tx: TenantTx, organizationId: string): Promise<SellerTaxProfile> {
  const company = await sellerTaxProfile(tx, organizationId);
  if (!company.configured) {
    throw new APIError("BAD_REQUEST", { code: "COMPANY_NOT_SET_UP", message: "Save your company details first (Billing → Settings)." });
  }
  return company;
}

/* ---------------- Calculation ---------------- */

function taxInput(slug: DocumentSlug, v: DocumentValues, company: SellerTaxProfile, party: Party): DocumentTaxInput {
  const purchase = DOCUMENT_TYPES[slug].party === "supplier";
  // Purchases: the supplier charges GST if registered. Under reverse charge you
  // pay it yourself, so it's worked out even for unregistered suppliers.
  const sellerRegistered = purchase ? !!party.gstin || v.reverseCharge : company.registered;
  const sellerStateCode = purchase ? (party.stateCode ?? (v.reverseCharge ? company.stateCode : null)) : company.stateCode;
  return {
    sellerStateCode,
    sellerRegistered,
    roundOff: company.roundOff,
    placeOfSupply: v.placeOfSupply,
    pricesIncludeTax: v.pricesIncludeTax,
    reverseCharge: v.reverseCharge,
    zeroRated: v.zeroRated,
    invoiceDiscount: v.invoiceDiscount,
    charges: v.charges,
    lines: v.lines.map((l) => ({
      quantity: l.quantity,
      ratePaise: l.ratePaise,
      discount: l.discount,
      taxRate: l.taxRate,
      cessRate: l.cessRate,
      taxCategory: l.taxCategory,
    })),
  };
}

function calculate(slug: DocumentSlug, v: DocumentValues, company: SellerTaxProfile, party: Party): DocumentTaxResult {
  const input = taxInput(slug, v, company, party);
  if (input.sellerRegistered && !v.placeOfSupply) {
    invalid({ placeOfSupply: DOCUMENT_TYPES[slug].party === "supplier" ? "Set your business state in Billing → Settings → Tax." : "Choose the place of supply." });
  }
  try {
    return calculateGst(input);
  } catch (e) {
    if (e instanceof TaxInputError) {
      // On purchases a missing seller state means the supplier's.
      if (e.field === "sellerStateCode" && DOCUMENT_TYPES[slug].party === "supplier") invalid({ supplierId: "Add the supplier's state (or GSTIN) to their details." });
      invalid({ [e.field]: e.message }, e.message);
    }
    throw e;
  }
}

function headerTotals(r: DocumentTaxResult) {
  return {
    supplyType: r.supplyType,
    subtotalPaise: r.grossPaise,
    discountPaise: r.itemDiscountPaise + r.invoiceDiscountPaise,
    taxablePaise: r.taxablePaise,
    cgstPaise: r.cgstPaise,
    sgstPaise: r.sgstPaise,
    igstPaise: r.igstPaise,
    cessPaise: r.cessPaise,
    taxPaise: r.taxPaise,
    roundOffPaise: r.roundOffPaise,
    totalPaise: r.totalPaise,
    charges: r.charges,
  };
}

function itemRows(slug: DocumentSlug, organizationId: string, docId: string, userId: string | null, v: DocumentValues, r: DocumentTaxResult) {
  const { parentKey } = reg(slug);
  return v.lines.map((l, i) => {
    const t = r.lines[i];
    return {
      organizationId,
      [parentKey]: docId,
      lineNo: i + 1,
      productId: l.productId,
      serviceId: l.serviceId,
      description: l.description,
      hsnSac: l.hsnSac,
      quantity: l.quantity,
      unitCode: l.unitCode,
      ratePaise: l.ratePaise,
      discount: l.discount,
      discountPaise: t.itemDiscountPaise,
      grossPaise: t.grossPaise,
      invoiceDiscountPaise: t.invoiceDiscountPaise,
      taxCategory: l.taxCategory,
      taxRate: l.taxRate,
      cessRate: l.cessRate,
      taxablePaise: t.taxablePaise,
      cgstPaise: t.cgstPaise,
      sgstPaise: t.sgstPaise,
      igstPaise: t.igstPaise,
      cessPaise: t.cessPaise,
      totalPaise: t.totalPaise,
      createdBy: userId,
      updatedBy: userId,
    } as unknown as typeof businessInvoiceItems.$inferInsert;
  });
}

/* ---------------- Reading ---------------- */

const discountBack = (d: unknown) => (d && typeof d === "object" ? (d as DocumentValues["invoiceDiscount"]) : null);

async function readDocument(tx: TenantTx, organizationId: string, slug: DocumentSlug, id: string) {
  const r = reg(slug);
  const [doc] = await tx
    .select()
    .from(r.table)
    .where(and(eq(r.table.organizationId, organizationId), eq(r.table.id, id)));
  if (!doc) notFound(DOCUMENT_TYPES[slug].singular.toLowerCase());
  const row = doc as unknown as Record<string, unknown>;
  const items = await tx
    .select()
    .from(r.items)
    .where(and(eq(r.items.organizationId, organizationId), eq(r.parentCol, id)))
    .orderBy(asc(r.items.lineNo));

  const extraDate = r.extraKey ? ((row[r.extraKey] as string | null) ?? null) : null;
  const related = await relatedDocuments(tx, organizationId, slug, row);
  const payment = slug === "invoices" ? await invoicePayments(tx, organizationId, doc.id) : slug === "purchase-bills" ? await billPayments(tx, organizationId, doc.id) : null;
  const partyId = row[r.partyKey] as string;
  return {
    slug,
    id: doc.id,
    number: doc.number,
    status: doc.status,
    displayStatus: displayStatus(slug, doc.status, extraDate, todayInIndia()),
    issueDate: doc.issueDate,
    extraDate,
    partyId,
    customerId: r.partyKey === "customerId" ? partyId : null,
    supplierId: r.partyKey === "supplierId" ? partyId : null,
    partyName: doc.partyName,
    partyGstin: doc.partyGstin,
    partyReference: (row.supplierBillNumber as string | null) ?? null,
    billingAddress: doc.billingAddress as AddressValues | null,
    shippingAddress: doc.shippingAddress as AddressValues | null,
    /** Notes and returns: the invoice or bill adjusted. */
    sourceId: r.sourceKey ? ((row[r.sourceKey] as string | null) ?? null) : null,
    invoiceId: (row.invoiceId as string | null) ?? null,
    quotationId: (row.quotationId as string | null) ?? null,
    salesOrderId: (row.salesOrderId as string | null) ?? null,
    purchaseOrderId: (row.purchaseOrderId as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    placeOfSupply: doc.placeOfSupply,
    supplyType: doc.supplyType,
    pricesIncludeTax: doc.pricesIncludeTax,
    reverseCharge: doc.reverseCharge,
    zeroRated: doc.zeroRated as DocumentValues["zeroRated"],
    invoiceDiscount: discountBack(doc.invoiceDiscount),
    charges: doc.charges as DocumentTaxResult["charges"],
    subtotalPaise: doc.subtotalPaise,
    discountPaise: doc.discountPaise,
    taxablePaise: doc.taxablePaise,
    cgstPaise: doc.cgstPaise,
    sgstPaise: doc.sgstPaise,
    igstPaise: doc.igstPaise,
    cessPaise: doc.cessPaise,
    taxPaise: doc.taxPaise,
    roundOffPaise: doc.roundOffPaise,
    totalPaise: doc.totalPaise,
    /** Your company's details when issued (seller on sales, buyer on purchases). */
    seller: doc.seller as SellerSnapshot | null,
    financialYear: doc.financialYear,
    issuedAt: doc.issuedAt,
    notes: doc.notes,
    terms: doc.terms,
    voidedAt: doc.voidedAt,
    voidReason: doc.voidReason,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    items: items.map((i) => ({
      id: i.id,
      lineNo: i.lineNo,
      productId: i.productId,
      serviceId: i.serviceId,
      description: i.description,
      hsnSac: i.hsnSac,
      quantity: i.quantity,
      unitCode: i.unitCode,
      ratePaise: i.ratePaise,
      discount: discountBack(i.discount),
      discountPaise: i.discountPaise,
      grossPaise: i.grossPaise,
      invoiceDiscountPaise: i.invoiceDiscountPaise,
      taxCategory: i.taxCategory,
      taxRate: i.taxRate,
      cessRate: i.cessRate,
      taxablePaise: i.taxablePaise,
      cgstPaise: i.cgstPaise,
      sgstPaise: i.sgstPaise,
      igstPaise: i.igstPaise,
      cessPaise: i.cessPaise,
      totalPaise: i.totalPaise,
    })),
    related,
    /** Invoices and purchase bills: what has been paid, adjusted and is still due. */
    payment,
  };
}

/** Payments allocated to an invoice, and its balance. */
async function invoicePayments(tx: TenantTx, organizationId: string, invoiceId: string) {
  const b = (await invoiceBalances(tx, organizationId, [invoiceId])).get(invoiceId);
  return {
    paidPaise: b?.paidPaise ?? 0,
    creditedPaise: b?.creditedPaise ?? 0,
    debitedPaise: b?.debitedPaise ?? 0,
    creditRefundedPaise: b?.creditRefundedPaise ?? 0,
    balancePaise: b?.balancePaise ?? 0,
    payments: await allocationsTo(tx, organizationId, eq(paymentAllocations.invoiceId, invoiceId)),
  };
}

/** Supplier payments allocated to a bill, and its balance. Returns count as credits. */
async function billPayments(tx: TenantTx, organizationId: string, billId: string) {
  const b = (await billBalances(tx, organizationId, [billId])).get(billId);
  return {
    paidPaise: b?.paidPaise ?? 0,
    creditedPaise: b?.returnedPaise ?? 0,
    debitedPaise: 0,
    creditRefundedPaise: 0,
    balancePaise: b?.balancePaise ?? 0,
    payments: await allocationsTo(tx, organizationId, eq(paymentAllocations.purchaseBillId, billId)),
  };
}

function allocationsTo(tx: TenantTx, organizationId: string, target: SQL) {
  return tx
    .select({
      paymentId: businessPayments.id,
      number: businessPayments.number,
      paymentDate: businessPayments.paymentDate,
      method: businessPayments.method,
      status: businessPayments.status,
      amountPaise: paymentAllocations.amountPaise,
    })
    .from(paymentAllocations)
    .innerJoin(businessPayments, and(eq(businessPayments.organizationId, paymentAllocations.organizationId), eq(businessPayments.id, paymentAllocations.paymentId)))
    .where(and(eq(paymentAllocations.organizationId, organizationId), target))
    .orderBy(asc(businessPayments.paymentDate));
}

export type DocumentDetail = Awaited<ReturnType<typeof readDocument>>;

type Related = { slug: DocumentSlug; id: string; number: string | null; status: string; totalPaise: number };

/** Links in both directions: what this came from, and what was made from it. */
async function relatedDocuments(tx: TenantTx, organizationId: string, slug: DocumentSlug, row: Record<string, unknown>): Promise<Related[]> {
  const out: Related[] = [];
  const pick = async (s: DocumentSlug, where: SQL | undefined) => {
    const r = reg(s);
    const rows = await tx
      .select({ id: r.table.id, number: r.table.number, status: r.table.status, totalPaise: r.table.totalPaise })
      .from(r.table)
      .where(and(eq(r.table.organizationId, organizationId), where))
      .orderBy(asc(r.table.createdAt));
    out.push(...rows.map((x) => ({ slug: s, ...x })));
  };
  const id = row.id as string;
  if (row.quotationId) await pick("quotations", eq(quotations.id, row.quotationId as string));
  if (row.salesOrderId) await pick("sales-orders", eq(salesOrders.id, row.salesOrderId as string));
  if (row.invoiceId) await pick("invoices", eq(businessInvoices.id, row.invoiceId as string));
  if (row.purchaseOrderId) await pick("purchase-orders", eq(purchaseOrders.id, row.purchaseOrderId as string));
  if (slug === "purchase-returns" && row.purchaseBillId) await pick("purchase-bills", eq(purchaseBills.id, row.purchaseBillId as string));
  if (slug === "quotations") {
    await pick("sales-orders", eq(salesOrders.quotationId, id));
    await pick("invoices", eq(businessInvoices.quotationId, id));
  }
  if (slug === "sales-orders") await pick("invoices", eq(businessInvoices.salesOrderId, id));
  if (slug === "invoices") {
    await pick("credit-notes", eq(creditNotes.invoiceId, id));
    await pick("debit-notes", eq(debitNotes.invoiceId, id));
  }
  if (slug === "purchase-orders") await pick("purchase-bills", eq(purchaseBills.purchaseOrderId, id));
  if (slug === "purchase-bills") await pick("purchase-returns", eq(purchaseReturns.purchaseBillId, id));
  return out;
}

export async function getDocument(organizationId: string, slug: DocumentSlug, id: string) {
  return withTenant(organizationId, (tx) => readDocument(tx, organizationId, slug, id));
}

export async function listDocuments(organizationId: string, slug: DocumentSlug, q: Omit<ListQuery, "status"> & { status: string | null; partyId: string | null }) {
  const r = reg(slug);
  return withTenant(organizationId, async (tx) => {
    const today = todayInIndia();
    let statusFilter: SQL | undefined;
    if (q.status === "overdue" && r.extraCol) {
      statusFilter = and(inArray(r.table.status, slug === "purchase-bills" ? ["recorded", "partially_paid"] : ["issued", "partially_paid"]), lt(r.extraCol, today));
    } else if (q.status === "expired" && r.extraCol) {
      statusFilter = and(eq(r.table.status, "sent"), lt(r.extraCol, today));
    } else if (q.status === "open") {
      statusFilter = notInArray(r.table.status, ["draft", "void"]);
    } else if (q.status && DOCUMENT_TYPES[slug].statuses.includes(q.status)) {
      statusFilter = eq(r.table.status, q.status);
    }
    const searchCols = [r.table.number, r.table.partyName, r.table.partyGstin];
    if (slug === "purchase-bills") searchCols.push(purchaseBills.supplierBillNumber as unknown as typeof r.table.number);
    const filter = and(eq(r.table.organizationId, organizationId), statusFilter, q.partyId ? eq(r.partyCol, q.partyId) : undefined, searchFilter(q.q, searchCols));
    const [{ total }] = await tx.select({ total: count() }).from(r.table).where(filter);
    const rows = await tx
      .select({
        id: r.table.id,
        number: r.table.number,
        status: r.table.status,
        issueDate: r.table.issueDate,
        extraDate: r.extraCol ? sql<string | null>`${r.extraCol}` : sql<null>`null`,
        partyName: r.table.partyName,
        partyReference: slug === "purchase-bills" ? sql<string | null>`${purchaseBills.supplierBillNumber}` : sql<null>`null`,
        totalPaise: r.table.totalPaise,
        updatedAt: r.table.updatedAt,
      })
      .from(r.table)
      .where(filter)
      // Drafts first, then newest issued.
      .orderBy(desc(sql`${r.table.status} = 'draft'`), desc(r.table.issueDate), desc(r.table.sequenceNumber), desc(r.table.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const items = rows.map((x) => ({ ...x, displayStatus: displayStatus(slug, x.status, x.extraDate, today) }));
    return paged(items, total, { ...q, status: "all" });
  });
}

/* ---------------- Checks shared by save and issue ---------------- */

/** Products and services on the lines must belong to this company. */
async function checkCatalogueIds(tx: TenantTx, organizationId: string, lines: DocumentLineValues[]) {
  const productIds = [...new Set(lines.map((l) => l.productId).filter(Boolean) as string[])];
  const serviceIds = [...new Set(lines.map((l) => l.serviceId).filter(Boolean) as string[])];
  if (productIds.length) {
    const found = await tx.select({ id: products.id }).from(products).where(and(eq(products.organizationId, organizationId), inArray(products.id, productIds)));
    const ok = new Set(found.map((f) => f.id));
    lines.forEach((l, i) => {
      if (l.productId && !ok.has(l.productId)) invalid({ [`lines.${i}.productId`]: "This product doesn't exist." });
    });
  }
  if (serviceIds.length) {
    const found = await tx.select({ id: services.id }).from(services).where(and(eq(services.organizationId, organizationId), inArray(services.id, serviceIds)));
    const ok = new Set(found.map((f) => f.id));
    lines.forEach((l, i) => {
      if (l.serviceId && !ok.has(l.serviceId)) invalid({ [`lines.${i}.serviceId`]: "This service doesn't exist." });
    });
  }
}

/** Notes and returns: the invoice or bill must be issued (not draft or void) and for the same party. */
async function checkSource(tx: TenantTx, organizationId: string, slug: DocumentSlug, sourceId: string, partyId: string) {
  const sourceSlug = DOCUMENT_TYPES[slug].source!;
  const r = reg(sourceSlug);
  const field = sourceSlug === "purchase-bills" ? "billId" : "invoiceId";
  const what = DOCUMENT_TYPES[sourceSlug].singular.toLowerCase();
  const [src] = await tx
    .select({ id: r.table.id, status: r.table.status, partyId: sql<string>`${r.partyCol}`, totalPaise: r.table.totalPaise, number: r.table.number })
    .from(r.table)
    .where(and(eq(r.table.organizationId, organizationId), eq(r.table.id, sourceId)));
  if (!src) invalid({ [field]: `Choose a ${what}.` });
  if (!LIVE[sourceSlug].includes(src.status)) invalid({ [field]: `Choose an issued ${what} (not a draft or void one).` });
  if (src.partyId !== partyId) invalid({ [field]: `This ${what} is for a different ${DOCUMENT_TYPES[slug].party}.` });
  return src;
}

/* ---------------- Drafts ---------------- */

async function prepare(tx: TenantTx, organizationId: string, slug: DocumentSlug, v: DocumentValues) {
  const type = DOCUMENT_TYPES[slug];
  const company = await requireCompany(tx, organizationId);
  const party = await loadParty(tx, organizationId, slug, v.partyId);
  if (party.archivedAt) invalid({ [type.party === "customer" ? "customerId" : "supplierId"]: `This ${type.party} is archived. Restore them first.` });
  await checkCatalogueIds(tx, organizationId, v.lines);
  if (type.needsInvoice && v.sourceId) await checkSource(tx, organizationId, slug, v.sourceId, v.partyId);
  if (!v.lines.length) invalid({ lines: "Add at least one item." });

  const values: DocumentValues = { ...v, placeOfSupply: v.placeOfSupply ?? defaultPlaceOfSupply(slug, party, company) };
  // Invoices and bills: due date defaults to the party's payment terms.
  if ((slug === "invoices" || slug === "purchase-bills") && !values.extraDate && party.paymentTermsDays !== null) {
    const d = new Date(`${values.issueDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + party.paymentTermsDays);
    values.extraDate = d.toISOString().slice(0, 10);
  }
  const result = calculate(slug, values, company, party);
  return { values, result, party };
}

function headerValues(slug: DocumentSlug, v: DocumentValues, r: DocumentTaxResult, party: Party) {
  const { extraKey, partyKey, sourceKey } = reg(slug);
  return {
    [partyKey]: v.partyId,
    issueDate: v.issueDate,
    ...(extraKey ? { [extraKey]: v.extraDate } : {}),
    ...(sourceKey ? { [sourceKey]: v.sourceId, reason: v.reason } : {}),
    ...(slug === "purchase-bills" ? { supplierBillNumber: v.partyReference } : {}),
    placeOfSupply: v.placeOfSupply,
    pricesIncludeTax: v.pricesIncludeTax,
    reverseCharge: v.reverseCharge,
    zeroRated: v.zeroRated,
    invoiceDiscount: v.invoiceDiscount,
    notes: v.notes,
    terms: v.terms,
    ...partySnapshot(party),
    ...headerTotals(r),
  };
}

type Links = { quotationId?: string; salesOrderId?: string; purchaseOrderId?: string };

export async function createDraft(organizationId: string, userId: string, slug: DocumentSlug, v: DocumentValues, links: Links = {}) {
  const r = reg(slug);
  return guardLock(
    () =>
      withTenant(organizationId, async (tx) => {
        const { values, result, party } = await prepare(tx, organizationId, slug, v);
        const [row] = await tx
          .insert(r.table)
          .values({ organizationId, status: "draft", ...headerValues(slug, values, result, party), ...links, createdBy: userId, updatedBy: userId } as unknown as typeof businessInvoices.$inferInsert)
          .returning({ id: r.table.id });
        await tx.insert(r.items).values(itemRows(slug, organizationId, row.id, userId, values, result));
        return readDocument(tx, organizationId, slug, row.id);
      }),
    DOCUMENT_TYPES[slug].singular,
  );
}

async function lockRow(tx: TenantTx, organizationId: string, slug: DocumentSlug, id: string) {
  const r = reg(slug);
  const [row] = await tx
    .select()
    .from(r.table)
    .where(and(eq(r.table.organizationId, organizationId), eq(r.table.id, id)))
    .for("update");
  if (!row) notFound(DOCUMENT_TYPES[slug].singular.toLowerCase());
  return row as typeof businessInvoices.$inferSelect & Record<string, unknown>;
}

export async function updateDraft(organizationId: string, userId: string, slug: DocumentSlug, id: string, v: DocumentValues) {
  const r = reg(slug);
  const what = DOCUMENT_TYPES[slug].singular;
  return guardLock(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await lockRow(tx, organizationId, slug, id);
        if (current.status !== "draft") locked(what);
        const { values, result, party } = await prepare(tx, organizationId, slug, v);
        await tx.delete(r.items).where(and(eq(r.items.organizationId, organizationId), eq(r.parentCol, id)));
        await tx.insert(r.items).values(itemRows(slug, organizationId, id, userId, values, result));
        await tx
          .update(r.table)
          .set({ ...headerValues(slug, values, result, party), updatedBy: userId } as unknown as Partial<typeof businessInvoices.$inferInsert>)
          .where(and(eq(r.table.organizationId, organizationId), eq(r.table.id, id)));
        return readDocument(tx, organizationId, slug, id);
      }),
    what,
  );
}

/** Drafts have no number and aren't records yet, so they can be deleted. */
export async function deleteDraft(organizationId: string, slug: DocumentSlug, id: string) {
  const r = reg(slug);
  const what = DOCUMENT_TYPES[slug].singular;
  return guardLock(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await lockRow(tx, organizationId, slug, id);
        if (current.status !== "draft") conflict("DOCUMENT_LOCKED", `Issued ${what.toLowerCase()}s can't be deleted. Void it instead.`);
        await tx.delete(r.table).where(and(eq(r.table.organizationId, organizationId), eq(r.table.id, id)));
      }),
    what,
  );
}

/* ---------------- Issuing ---------------- */

/** Rebuilds the editable values of a stored draft (to recalculate at issue time). */
function valuesFromStored(doc: DocumentDetail): DocumentValues {
  return {
    partyId: doc.partyId,
    issueDate: doc.issueDate,
    extraDate: doc.extraDate,
    sourceId: doc.sourceId,
    partyReference: doc.partyReference,
    reason: doc.reason,
    placeOfSupply: doc.placeOfSupply,
    pricesIncludeTax: doc.pricesIncludeTax,
    reverseCharge: doc.reverseCharge,
    zeroRated: doc.zeroRated,
    invoiceDiscount: doc.invoiceDiscount,
    charges: (doc.charges ?? []).map((c) => ({ label: c.label, amountPaise: c.amountPaise, taxRate: c.appliedTaxRate })),
    notes: doc.notes,
    terms: doc.terms,
    lines: doc.items.map((i) => ({
      productId: i.productId,
      serviceId: i.serviceId,
      description: i.description,
      hsnSac: i.hsnSac,
      quantity: i.quantity,
      unitCode: i.unitCode,
      ratePaise: i.ratePaise,
      discount: i.discount,
      taxCategory: i.taxCategory as DocumentLineValues["taxCategory"],
      taxRate: i.taxRate,
      cessRate: i.cessRate,
    })),
  };
}

/**
 * Issues a draft: recalculates with today's company settings, checks it,
 * takes the next number, copies company and party details, and locks it.
 * `beforeIssue` runs inside the transaction (e.g. the plan's invoice limit).
 */
export async function issueDocument(organizationId: string, userId: string, slug: DocumentSlug, id: string, beforeIssue?: () => Promise<void>) {
  const r = reg(slug);
  const type = DOCUMENT_TYPES[slug];
  return guardLock(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await lockRow(tx, organizationId, slug, id);
        if (current.status !== "draft") conflict("ALREADY_ISSUED", `This ${type.singular.toLowerCase()} is already ${current.status === "void" ? "void" : "issued"}.`);
        const stored = await readDocument(tx, organizationId, slug, id);
        const v = valuesFromStored(stored);
        const sourceField = type.source === "purchase-bills" ? "billId" : "invoiceId";
        if (type.needsInvoice && !v.reason) invalid({ reason: "Give a reason before issuing." });
        if (type.needsInvoice && !v.sourceId) invalid({ [sourceField]: `Choose the ${DOCUMENT_TYPES[type.source!].singular.toLowerCase()} this adjusts.` });
        if (type.partyReference && !v.partyReference) invalid({ partyReference: `Enter the ${type.partyReference.label.toLowerCase()}.` });

        const { values, result, party } = await prepare(tx, organizationId, slug, v);
        if (result.totalPaise <= 0) invalid({ lines: "The total must be more than zero." });

        if (slug === "credit-notes" || slug === "purchase-returns") {
          // Credits and returns can't exceed the invoice or bill they adjust.
          const src = await checkSource(tx, organizationId, slug, values.sourceId!, values.partyId);
          const [{ done }] = await tx
            .select({ done: sql<number>`coalesce(sum(${r.table.totalPaise}), 0)`.mapWith(Number) })
            .from(r.table)
            .where(and(eq(r.table.organizationId, organizationId), eq(reg(slug).table[r.sourceKey as "id"], src.id), eq(r.table.status, "issued"), ne(r.table.id, id)));
          if (done + result.totalPaise > src.totalPaise) {
            const what = slug === "credit-notes" ? "Credit notes" : "Returns";
            invalid({ lines: `${what} for ${src.number} can't exceed its total. ${((src.totalPaise - done) / 100).toFixed(2)} rupees is left.` }, `This is more than what's left on ${src.number}.`);
          }
        }
        if (beforeIssue) await beforeIssue();

        const seller = await sellerSnapshot(tx, organizationId);
        const n = await allocateDocumentNumber(tx, organizationId, { documentType: type.numbering, date: new Date(`${values.issueDate}T00:00:00Z`) });

        // Lines first (allowed while it's still a draft), then the header flips to issued.
        await tx.delete(r.items).where(and(eq(r.items.organizationId, organizationId), eq(r.parentCol, id)));
        await tx.insert(r.items).values(itemRows(slug, organizationId, id, userId, values, result));
        await tx
          .update(r.table)
          .set({
            ...headerValues(slug, values, result, party),
            status: type.issuedStatus,
            number: n.number,
            financialYear: n.financialYear,
            sequenceNumber: n.sequence,
            seller,
            issuedAt: new Date(),
            updatedBy: userId,
          } as unknown as Partial<typeof businessInvoices.$inferInsert>)
          .where(and(eq(r.table.organizationId, organizationId), eq(r.table.id, id)));

        // The quotation or order this came from is now done.
        const src = current as Record<string, unknown>;
        if (src.quotationId) {
          await tx
            .update(quotations)
            .set({ status: "converted", updatedBy: userId })
            .where(and(eq(quotations.organizationId, organizationId), eq(quotations.id, src.quotationId as string), inArray(quotations.status, ["sent", "accepted"])));
        }
        if (slug === "invoices" && src.salesOrderId) {
          await tx
            .update(salesOrders)
            .set({ status: "invoiced", updatedBy: userId })
            .where(and(eq(salesOrders.organizationId, organizationId), eq(salesOrders.id, src.salesOrderId as string), inArray(salesOrders.status, ["confirmed", "fulfilled"])));
        }
        if (slug === "purchase-bills" && src.purchaseOrderId) {
          await tx
            .update(purchaseOrders)
            .set({ status: "billed", updatedBy: userId })
            .where(and(eq(purchaseOrders.organizationId, organizationId), eq(purchaseOrders.id, src.purchaseOrderId as string), inArray(purchaseOrders.status, ["sent", "received"])));
        }
        // A note or return changes what its invoice or bill still owes.
        if (type.source === "invoices") await refreshInvoiceStatus(tx, organizationId, values.sourceId);
        if (type.source === "purchase-bills") await refreshBillStatus(tx, organizationId, values.sourceId);
        return readDocument(tx, organizationId, slug, id);
      }),
    type.singular,
  );
}

/* ---------------- Voiding and status ---------------- */

async function countIssued(tx: TenantTx, organizationId: string, slug: DocumentSlug, key: string, id: string) {
  const r = reg(slug);
  const col = (r.table as unknown as Record<string, AnyColumn>)[key];
  const [x] = await tx.select({ n: count() }).from(r.table).where(and(eq(r.table.organizationId, organizationId), eq(col, id), eq(r.table.status, "issued")));
  return x.n;
}

async function countPayments(tx: TenantTx, organizationId: string, target: SQL) {
  const [x] = await tx
    .select({ n: count() })
    .from(paymentAllocations)
    .innerJoin(businessPayments, and(eq(businessPayments.organizationId, paymentAllocations.organizationId), eq(businessPayments.id, paymentAllocations.paymentId)))
    .where(and(eq(paymentAllocations.organizationId, organizationId), target, eq(businessPayments.status, "recorded")));
  return x.n;
}

export async function voidDocument(organizationId: string, userId: string, slug: DocumentSlug, id: string, reason: string) {
  const r = reg(slug);
  const type = DOCUMENT_TYPES[slug];
  return guardLock(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await lockRow(tx, organizationId, slug, id);
        if (current.status === "draft") conflict("NOT_ISSUED", "Drafts aren't records yet: delete it instead.");
        if (current.status === "void") conflict("ALREADY_VOID", `This ${type.singular.toLowerCase()} is already void.`);
        if (slug === "invoices") {
          if ((await countPayments(tx, organizationId, eq(paymentAllocations.invoiceId, id))) > 0) {
            conflict("HAS_PAYMENTS", "This invoice has payments recorded against it. Void those payments first, or raise a credit note.");
          }
          if ((await countIssued(tx, organizationId, "credit-notes", "invoiceId", id)) + (await countIssued(tx, organizationId, "debit-notes", "invoiceId", id)) > 0) {
            conflict("HAS_NOTES", "This invoice has issued credit or debit notes. Void those first.");
          }
        }
        if (slug === "purchase-bills") {
          if ((await countPayments(tx, organizationId, eq(paymentAllocations.purchaseBillId, id))) > 0) {
            conflict("HAS_PAYMENTS", "This bill has payments recorded against it. Void those payments first, or raise a purchase return.");
          }
          if ((await countIssued(tx, organizationId, "purchase-returns", "purchaseBillId", id)) > 0) conflict("HAS_NOTES", "This bill has issued purchase returns. Void those first.");
        }
        if (slug === "quotations" && current.status === "converted") conflict("CONVERTED", "This quotation became an order or invoice. Void that instead.");
        if (slug === "sales-orders" && current.status === "invoiced") conflict("CONVERTED", "This order has been invoiced. Void the invoice instead.");
        if (slug === "purchase-orders" && current.status === "billed") conflict("CONVERTED", "This order has been billed. Void the bill instead.");
        await tx
          .update(r.table)
          .set({ status: "void", voidedAt: new Date(), voidReason: reason, updatedBy: userId })
          .where(and(eq(r.table.organizationId, organizationId), eq(r.table.id, id)));
        const sourceId = r.sourceKey ? ((current as Record<string, unknown>)[r.sourceKey] as string | null) : null;
        if (type.source === "invoices") await refreshInvoiceStatus(tx, organizationId, sourceId);
        if (type.source === "purchase-bills") await refreshBillStatus(tx, organizationId, sourceId);
        return readDocument(tx, organizationId, slug, id);
      }),
    type.singular,
  );
}

/** A customer accepted or declined a sent quotation. */
export async function respondToQuotation(organizationId: string, userId: string, id: string, status: (typeof QUOTATION_RESPONSES)[number]) {
  return withTenant(organizationId, async (tx) => {
    const current = await lockRow(tx, organizationId, "quotations", id);
    if (!["sent", "accepted", "declined"].includes(current.status)) {
      conflict("WRONG_STATUS", current.status === "draft" ? "Finalise the quotation first." : `A ${current.status} quotation can't change.`);
    }
    await tx
      .update(quotations)
      .set({ status, updatedBy: userId })
      .where(and(eq(quotations.organizationId, organizationId), eq(quotations.id, id)));
    return readDocument(tx, organizationId, "quotations", id);
  });
}

/** A purchase order's goods arrived (sent → received). */
export async function markPurchaseOrderReceived(organizationId: string, userId: string, id: string) {
  return withTenant(organizationId, async (tx) => {
    const current = await lockRow(tx, organizationId, "purchase-orders", id);
    if (current.status !== "sent") conflict("WRONG_STATUS", current.status === "draft" ? "Finalise the purchase order first." : `A ${current.status} purchase order can't be marked received.`);
    await tx
      .update(purchaseOrders)
      .set({ status: "received", updatedBy: userId })
      .where(and(eq(purchaseOrders.organizationId, organizationId), eq(purchaseOrders.id, id)));
    return readDocument(tx, organizationId, "purchase-orders", id);
  });
}

/* ---------------- Converting ---------------- */

const CONVERTIBLE_FROM: Record<DocumentSlug, readonly string[]> = {
  quotations: ["sent", "accepted"],
  "sales-orders": ["confirmed", "fulfilled"],
  invoices: ["issued", "partially_paid", "paid"],
  "credit-notes": [],
  "debit-notes": [],
  "purchase-orders": ["sent", "received"],
  "purchase-bills": ["recorded", "partially_paid", "paid"],
  "purchase-returns": [],
};

/**
 * Makes a new draft from an issued document: quotation → order/invoice,
 * order → invoice, invoice → credit/debit note, purchase order → bill,
 * bill → purchase return.
 */
export async function convertDocument(organizationId: string, userId: string, from: DocumentSlug, id: string, to: DocumentSlug) {
  if (!DOCUMENT_TYPES[from].convertsTo.includes(to)) invalid({ to: `A ${DOCUMENT_TYPES[from].singular.toLowerCase()} can't become a ${DOCUMENT_TYPES[to].singular.toLowerCase()}.` });
  const source = await getDocument(organizationId, from, id);
  if (!CONVERTIBLE_FROM[from].includes(source.status)) {
    conflict("WRONG_STATUS", source.status === "draft" ? `Issue the ${DOCUMENT_TYPES[from].singular.toLowerCase()} first.` : `A ${source.status} ${DOCUMENT_TYPES[from].singular.toLowerCase()} can't be converted.`);
  }
  const v = valuesFromStored(source);
  const values: DocumentValues = {
    ...v,
    issueDate: todayInIndia(),
    extraDate: null,
    sourceId: DOCUMENT_TYPES[to].needsInvoice ? source.id : null,
    // Notes need their own reason, and bills the supplier's number, before issuing.
    reason: null,
    partyReference: null,
  };
  const links: Links =
    from === "quotations"
      ? { quotationId: source.id }
      : from === "sales-orders"
        ? { salesOrderId: source.id, ...(source.quotationId ? { quotationId: source.quotationId } : {}) }
        : from === "purchase-orders"
          ? { purchaseOrderId: source.id }
          : {};
  return createDraft(organizationId, userId, to, values, links);
}

/* ---------------- Pickers ---------------- */

/** Issued invoices of a customer (or bills of a supplier), for choosing what a note or return adjusts. */
export async function sourcesForNotes(organizationId: string, slug: DocumentSlug, partyId: string) {
  const sourceSlug = DOCUMENT_TYPES[slug].source ?? (DOCUMENT_TYPES[slug].party === "supplier" ? "purchase-bills" : "invoices");
  const r = reg(sourceSlug);
  return withTenant(organizationId, async (tx) =>
    tx
      .select({ id: r.table.id, number: r.table.number, issueDate: r.table.issueDate, totalPaise: r.table.totalPaise })
      .from(r.table)
      .where(and(eq(r.table.organizationId, organizationId), eq(r.partyCol, partyId), inArray(r.table.status, [...LIVE[sourceSlug]])))
      .orderBy(desc(r.table.issueDate))
      .limit(100),
  );
}

/** @deprecated use sourcesForNotes. Issued invoices of a customer. */
export const invoicesForNotes = (organizationId: string, customerId: string) => sourcesForNotes(organizationId, "credit-notes", customerId);

/**
 * Active products and services for the line picker. Sales: selling prices,
 * with the customer's price list applied. Purchases: purchase prices.
 */
export async function catalogueForDocuments(organizationId: string, priceListId: string | null, purpose: "sale" | "purchase" = "sale") {
  return withTenant(organizationId, async (tx) => {
    const listPrice = (kind: "product" | "service", idCol: AnyColumn) =>
      priceListId && purpose === "sale"
        ? sql<number | null>`(select price_paise from price_list_items pli where pli.organization_id = ${organizationId} and pli.price_list_id = ${priceListId} and pli.${sql.raw(kind === "product" ? "product_id" : "service_id")} = ${idCol})`
        : sql<null>`null`;
    const prods = await tx
      .select({
        id: products.id,
        name: products.name,
        code: products.sku,
        hsnSac: products.hsnCode,
        ratePaise: purpose === "purchase" ? products.purchasePricePaise : products.salePricePaise,
        listPricePaise: listPrice("product", products.id),
        taxCategory: products.taxCategory,
        taxRate: products.taxRate,
        cessRate: products.cessRate,
        unitCode: sql<string | null>`(select code from units u where u.organization_id = ${organizationId} and u.id = ${products.unitId})`,
      })
      .from(products)
      .where(and(eq(products.organizationId, organizationId), isNull(products.archivedAt)))
      .orderBy(asc(sql`lower(${products.name})`))
      .limit(1000);
    const servs = await tx
      .select({
        id: services.id,
        name: services.name,
        code: services.code,
        hsnSac: services.sacCode,
        ratePaise: services.ratePaise,
        listPricePaise: listPrice("service", services.id),
        taxCategory: services.taxCategory,
        taxRate: services.taxRate,
        cessRate: sql<string>`'0'`,
        unitCode: sql<string | null>`(select code from units u where u.organization_id = ${organizationId} and u.id = ${services.unitId})`,
      })
      .from(services)
      .where(and(eq(services.organizationId, organizationId), isNull(services.archivedAt)))
      .orderBy(asc(sql`lower(${services.name})`))
      .limit(1000);
    const norm = <T extends { listPricePaise: unknown }>(x: T) => ({ ...x, listPricePaise: x.listPricePaise === null ? null : Number(x.listPricePaise) });
    return { products: prods.map(norm), services: servs.map(norm) };
  });
}

/** Party details the editor needs: default place of supply, terms, price list. */
export async function partyForDocuments(organizationId: string, slug: DocumentSlug, partyId: string) {
  return withTenant(organizationId, async (tx) => {
    const party = await loadParty(tx, organizationId, slug, partyId);
    const company = await sellerTaxProfile(tx, organizationId);
    return {
      id: party.id,
      name: party.name,
      gstin: party.gstin,
      archived: !!party.archivedAt,
      placeOfSupply: defaultPlaceOfSupply(slug, party, company),
      stateCode: party.stateCode,
      paymentTermsDays: party.paymentTermsDays,
      priceListId: party.priceListId,
      billingAddress: party.billing,
      shippingAddress: party.shipping,
    };
  });
}

/** @deprecated use partyForDocuments. */
export const customerForDocuments = (organizationId: string, customerId: string) => partyForDocuments(organizationId, "invoices", customerId);
