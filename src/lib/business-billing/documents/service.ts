import { APIError } from "better-auth/api";
import { type AnyColumn, type SQL, and, asc, count, desc, eq, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";

import {
  billingSettings,
  businessInvoiceItems,
  businessInvoices,
  creditNoteItems,
  creditNotes,
  customerAddresses,
  customers,
  debitNoteItems,
  debitNotes,
  organization,
  products,
  quotationItems,
  quotations,
  salesOrderItems,
  salesOrders,
  services,
} from "@/db/schema";

import { type AddressValues, stateByCode } from "../fields";
import { allocateDocumentNumber } from "../numbering";
import { type ListQuery, conflict, invalid, notFound, paged, searchFilter } from "../records";
import { type DocumentTaxInput, type DocumentTaxResult, OUTSIDE_INDIA, TaxInputError, calculateGst } from "../tax/gst";
import { type SellerTaxProfile, sellerTaxProfile } from "../tax-settings";
import { type TenantTx, withTenant } from "../tenant-db";
import { DOCUMENT_TYPES, type DocumentSlug, QUOTATION_RESPONSES, displayStatus, todayInIndia } from "./types";
import type { DocumentLineValues, DocumentValues } from "./validation";

// Sales documents (quotations, sales orders, invoices, credit and debit notes).
//
// - Drafts can be edited and deleted. Totals are always recalculated here by
//   the GST engine; the browser's numbers are never stored.
// - Issuing (one transaction): recalculates, takes the next number for the
//   document's financial year, copies the seller's and customer's details as
//   they are now, and locks the document. Database triggers
//   (drizzle/*_lock_issued_documents) refuse any later change except status
//   and voiding, and refuse deleting it.
// - Mistakes are fixed by voiding (keeps the number) or with credit/debit notes.
// Every query filters by organization_id and runs under row-level security.

/* ---------------- Table registry ---------------- */

// The five tables share their columns (documentColumns/itemColumns in the
// schema), so one typed view of the invoice tables serves all of them.
type DocTable = typeof businessInvoices;
type ItemTable = typeof businessInvoiceItems;

const REGISTRY = {
  invoices: { table: businessInvoices, items: businessInvoiceItems, parentKey: "invoiceId", extraKey: "dueDate" },
  quotations: { table: quotations, items: quotationItems, parentKey: "quotationId", extraKey: "validUntil" },
  "sales-orders": { table: salesOrders, items: salesOrderItems, parentKey: "salesOrderId", extraKey: "expectedDate" },
  "credit-notes": { table: creditNotes, items: creditNoteItems, parentKey: "creditNoteId", extraKey: null },
  "debit-notes": { table: debitNotes, items: debitNoteItems, parentKey: "debitNoteId", extraKey: null },
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
    col: (k: string) => cols[k] as AnyColumn | undefined,
  };
}

/* ---------------- Errors ---------------- */

const locked = (what: string): never =>
  conflict("DOCUMENT_LOCKED", `This ${what.toLowerCase()} is issued and locked. Void it or raise a credit/debit note instead.`);

/** The lock trigger's error (hint DOCUMENT_LOCKED) as a 409. */
async function guardLock<T>(fn: () => Promise<T>, what: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    for (let x = e as { hint?: string; cause?: unknown } | undefined, i = 0; x && i < 4; i++) {
      if (x.hint === "DOCUMENT_LOCKED") locked(what);
      x = x.cause as typeof x;
    }
    throw e;
  }
}

/* ---------------- Customers and the seller ---------------- */

async function loadCustomer(tx: TenantTx, organizationId: string, id: string) {
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
  return { customer: c, billing: addr("billing"), shipping: addr("shipping") };
}

type LoadedCustomer = Awaited<ReturnType<typeof loadCustomer>>;

/** Default place of supply: where goods are delivered, else the customer's state; "96" abroad. */
export function defaultPlaceOfSupply(c: LoadedCustomer): string | null {
  const ship = c.shipping ?? c.billing;
  if (ship && ship.countryCode !== "IN") return OUTSIDE_INDIA;
  return c.shipping?.stateCode ?? c.customer.placeOfSupply ?? c.billing?.stateCode ?? null;
}

const partySnapshot = (c: LoadedCustomer) => ({
  partyName: c.customer.name,
  partyGstin: c.customer.gstin,
  billingAddress: c.billing,
  shippingAddress: c.shipping ?? c.billing,
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

export type SellerSnapshot = NonNullable<Awaited<ReturnType<typeof sellerSnapshot>>>;

async function requireSeller(tx: TenantTx, organizationId: string): Promise<SellerTaxProfile> {
  const seller = await sellerTaxProfile(tx, organizationId);
  if (!seller.configured) {
    throw new APIError("BAD_REQUEST", { code: "COMPANY_NOT_SET_UP", message: "Save your company details first (Billing → Settings)." });
  }
  return seller;
}

/* ---------------- Calculation ---------------- */

function taxInput(v: Pick<DocumentValues, "placeOfSupply" | "pricesIncludeTax" | "reverseCharge" | "zeroRated" | "invoiceDiscount" | "charges" | "lines">, seller: SellerTaxProfile): DocumentTaxInput {
  return {
    sellerStateCode: seller.stateCode,
    sellerRegistered: seller.registered,
    roundOff: seller.roundOff,
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

function calculate(v: DocumentValues, seller: SellerTaxProfile): DocumentTaxResult {
  if (seller.registered && !v.placeOfSupply) invalid({ placeOfSupply: "Choose the place of supply." });
  try {
    return calculateGst(taxInput(v, seller));
  } catch (e) {
    if (e instanceof TaxInputError) invalid({ [e.field]: e.message }, e.message);
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
  return {
    slug,
    id: doc.id,
    number: doc.number,
    status: doc.status,
    displayStatus: displayStatus(slug, doc.status, extraDate, todayInIndia()),
    issueDate: doc.issueDate,
    extraDate,
    customerId: doc.customerId,
    partyName: doc.partyName,
    partyGstin: doc.partyGstin,
    billingAddress: doc.billingAddress as AddressValues | null,
    shippingAddress: doc.shippingAddress as AddressValues | null,
    invoiceId: (row.invoiceId as string | null) ?? null,
    quotationId: (row.quotationId as string | null) ?? null,
    salesOrderId: (row.salesOrderId as string | null) ?? null,
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
  };
}

export type DocumentDetail = Awaited<ReturnType<typeof readDocument>>;

type Related = { slug: DocumentSlug; id: string; number: string | null; status: string; totalPaise: number };

/** Links in both directions: source quotation/order/invoice, and documents made from this one. */
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
  if (slug === "quotations") {
    await pick("sales-orders", eq(salesOrders.quotationId, id));
    await pick("invoices", eq(businessInvoices.quotationId, id));
  }
  if (slug === "sales-orders") await pick("invoices", eq(businessInvoices.salesOrderId, id));
  if (slug === "invoices") {
    await pick("credit-notes", eq(creditNotes.invoiceId, id));
    await pick("debit-notes", eq(debitNotes.invoiceId, id));
  }
  return out;
}

export async function getDocument(organizationId: string, slug: DocumentSlug, id: string) {
  return withTenant(organizationId, (tx) => readDocument(tx, organizationId, slug, id));
}

export async function listDocuments(organizationId: string, slug: DocumentSlug, q: Omit<ListQuery, "status"> & { status: string | null; customerId: string | null }) {
  const r = reg(slug);
  return withTenant(organizationId, async (tx) => {
    const today = todayInIndia();
    let statusFilter: SQL | undefined;
    if (q.status === "overdue" && r.extraCol) {
      statusFilter = and(inArray(r.table.status, ["issued", "partially_paid"]), lt(r.extraCol, today));
    } else if (q.status === "expired" && r.extraCol) {
      statusFilter = and(eq(r.table.status, "sent"), lt(r.extraCol, today));
    } else if (q.status === "open") {
      statusFilter = notInArray(r.table.status, ["draft", "void"]);
    } else if (q.status && DOCUMENT_TYPES[slug].statuses.includes(q.status)) {
      statusFilter = eq(r.table.status, q.status);
    }
    const filter = and(
      eq(r.table.organizationId, organizationId),
      statusFilter,
      q.customerId ? eq(r.table.customerId, q.customerId) : undefined,
      searchFilter(q.q, [r.table.number, r.table.partyName, r.table.partyGstin]),
    );
    const [{ total }] = await tx.select({ total: count() }).from(r.table).where(filter);
    const rows = await tx
      .select({
        id: r.table.id,
        number: r.table.number,
        status: r.table.status,
        issueDate: r.table.issueDate,
        extraDate: r.extraCol ? sql<string | null>`${r.extraCol}` : sql<null>`null`,
        partyName: r.table.partyName,
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

/** For notes: the invoice must be issued (not draft or void) and for the same customer. */
async function checkNoteInvoice(tx: TenantTx, organizationId: string, invoiceId: string, customerId: string) {
  const [inv] = await tx
    .select({ id: businessInvoices.id, status: businessInvoices.status, customerId: businessInvoices.customerId, totalPaise: businessInvoices.totalPaise, number: businessInvoices.number })
    .from(businessInvoices)
    .where(and(eq(businessInvoices.organizationId, organizationId), eq(businessInvoices.id, invoiceId)));
  if (!inv) invalid({ invoiceId: "Choose an invoice." });
  if (inv.status === "draft" || inv.status === "void") invalid({ invoiceId: "Choose an issued invoice (not a draft or void one)." });
  if (inv.customerId !== customerId) invalid({ invoiceId: "This invoice is for a different customer." });
  return inv;
}

/* ---------------- Drafts ---------------- */

async function prepare(tx: TenantTx, organizationId: string, slug: DocumentSlug, v: DocumentValues) {
  const seller = await requireSeller(tx, organizationId);
  const loaded = await loadCustomer(tx, organizationId, v.customerId);
  if (loaded.customer.archivedAt) invalid({ customerId: "This customer is archived. Restore them first." });
  await checkCatalogueIds(tx, organizationId, v.lines);
  if (DOCUMENT_TYPES[slug].needsInvoice && v.invoiceId) await checkNoteInvoice(tx, organizationId, v.invoiceId, v.customerId);
  if (!v.lines.length) invalid({ lines: "Add at least one item." });

  const values: DocumentValues = { ...v, placeOfSupply: v.placeOfSupply ?? defaultPlaceOfSupply(loaded) };
  // Invoices: due date defaults to the customer's payment terms.
  if (slug === "invoices" && !values.extraDate && loaded.customer.paymentTermsDays !== null) {
    const d = new Date(`${values.issueDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + loaded.customer.paymentTermsDays);
    values.extraDate = d.toISOString().slice(0, 10);
  }
  const result = calculate(values, seller);
  return { values, result, loaded };
}

function headerValues(slug: DocumentSlug, v: DocumentValues, r: DocumentTaxResult, loaded: LoadedCustomer) {
  const { extraKey } = reg(slug);
  return {
    customerId: v.customerId,
    issueDate: v.issueDate,
    ...(extraKey ? { [extraKey]: v.extraDate } : {}),
    ...(DOCUMENT_TYPES[slug].needsInvoice ? { invoiceId: v.invoiceId, reason: v.reason } : {}),
    placeOfSupply: v.placeOfSupply,
    pricesIncludeTax: v.pricesIncludeTax,
    reverseCharge: v.reverseCharge,
    zeroRated: v.zeroRated,
    invoiceDiscount: v.invoiceDiscount,
    notes: v.notes,
    terms: v.terms,
    ...partySnapshot(loaded),
    ...headerTotals(r),
  };
}

export async function createDraft(organizationId: string, userId: string, slug: DocumentSlug, v: DocumentValues, links: { quotationId?: string; salesOrderId?: string } = {}) {
  const r = reg(slug);
  return withTenant(organizationId, async (tx) => {
    const { values, result, loaded } = await prepare(tx, organizationId, slug, v);
    const [row] = await tx
      .insert(r.table)
      .values({ organizationId, status: "draft", ...headerValues(slug, values, result, loaded), ...links, createdBy: userId, updatedBy: userId } as unknown as typeof businessInvoices.$inferInsert)
      .returning({ id: r.table.id });
    await tx.insert(r.items).values(itemRows(slug, organizationId, row.id, userId, values, result));
    return readDocument(tx, organizationId, slug, row.id);
  });
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
        const { values, result, loaded } = await prepare(tx, organizationId, slug, v);
        await tx.delete(r.items).where(and(eq(r.items.organizationId, organizationId), eq(r.parentCol, id)));
        await tx.insert(r.items).values(itemRows(slug, organizationId, id, userId, values, result));
        await tx
          .update(r.table)
          .set({ ...headerValues(slug, values, result, loaded), updatedBy: userId } as unknown as Partial<typeof businessInvoices.$inferInsert>)
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
    customerId: doc.customerId,
    issueDate: doc.issueDate,
    extraDate: doc.extraDate,
    invoiceId: doc.invoiceId,
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
 * takes the next number, copies seller and customer details, and locks it.
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
        if (type.needsInvoice && !v.reason) invalid({ reason: "Give a reason before issuing." });
        if (type.needsInvoice && !v.invoiceId) invalid({ invoiceId: "Choose the invoice this note adjusts." });

        const { values, result, loaded } = await prepare(tx, organizationId, slug, v);
        if (result.totalPaise <= 0) invalid({ lines: "The total must be more than zero." });

        if (slug === "credit-notes") {
          // Credits can't exceed what was invoiced.
          const inv = await checkNoteInvoice(tx, organizationId, values.invoiceId!, values.customerId);
          const [{ credited }] = await tx
            .select({ credited: sql<number>`coalesce(sum(${creditNotes.totalPaise}), 0)`.mapWith(Number) })
            .from(creditNotes)
            .where(and(eq(creditNotes.organizationId, organizationId), eq(creditNotes.invoiceId, inv.id), inArray(creditNotes.status, ["issued"]), ne(creditNotes.id, id)));
          if (credited + result.totalPaise > inv.totalPaise) {
            invalid({ lines: `Credit notes for ${inv.number} can't exceed the invoice total. ${((inv.totalPaise - credited) / 100).toFixed(2)} rupees can still be credited.` }, "This credit note is more than what's left on the invoice.");
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
            ...headerValues(slug, values, result, loaded),
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
        return readDocument(tx, organizationId, slug, id);
      }),
    type.singular,
  );
}

/* ---------------- Voiding and status ---------------- */

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
          if (current.status === "partially_paid" || current.status === "paid") conflict("HAS_PAYMENTS", "This invoice has payments. Refund or remove them first, or raise a credit note.");
          const [cn] = await tx
            .select({ n: count() })
            .from(creditNotes)
            .where(and(eq(creditNotes.organizationId, organizationId), eq(creditNotes.invoiceId, id), eq(creditNotes.status, "issued")));
          const [dn] = await tx
            .select({ n: count() })
            .from(debitNotes)
            .where(and(eq(debitNotes.organizationId, organizationId), eq(debitNotes.invoiceId, id), eq(debitNotes.status, "issued")));
          if (cn.n + dn.n > 0) conflict("HAS_NOTES", "This invoice has issued credit or debit notes. Void those first.");
        }
        if (slug === "quotations" && current.status === "converted") conflict("CONVERTED", "This quotation became an order or invoice. Void that instead.");
        if (slug === "sales-orders" && current.status === "invoiced") conflict("CONVERTED", "This order has been invoiced. Void the invoice instead.");
        await tx
          .update(r.table)
          .set({ status: "void", voidedAt: new Date(), voidReason: reason, updatedBy: userId })
          .where(and(eq(r.table.organizationId, organizationId), eq(r.table.id, id)));
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

/* ---------------- Converting ---------------- */

const CONVERTIBLE_FROM: Record<DocumentSlug, readonly string[]> = {
  quotations: ["sent", "accepted"],
  "sales-orders": ["confirmed", "fulfilled"],
  invoices: ["issued", "partially_paid", "paid"],
  "credit-notes": [],
  "debit-notes": [],
};

/** Makes a new draft from an issued document: quotation → order/invoice, order → invoice, invoice → credit/debit note. */
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
    invoiceId: DOCUMENT_TYPES[to].needsInvoice ? source.id : null,
    // Notes need their own reason before they can be issued.
    reason: null,
  };
  const links = from === "quotations" ? { quotationId: source.id } : from === "sales-orders" ? { salesOrderId: source.id, ...(source.quotationId ? { quotationId: source.quotationId } : {}) } : {};
  return createDraft(organizationId, userId, to, values, links);
}

/* ---------------- Pickers ---------------- */

/** Issued invoices of a customer, for choosing what a credit/debit note adjusts. */
export async function invoicesForNotes(organizationId: string, customerId: string) {
  return withTenant(organizationId, async (tx) =>
    tx
      .select({ id: businessInvoices.id, number: businessInvoices.number, issueDate: businessInvoices.issueDate, totalPaise: businessInvoices.totalPaise })
      .from(businessInvoices)
      .where(and(eq(businessInvoices.organizationId, organizationId), eq(businessInvoices.customerId, customerId), inArray(businessInvoices.status, ["issued", "partially_paid", "paid"])))
      .orderBy(desc(businessInvoices.issueDate))
      .limit(100),
  );
}

/** Active products and services for the line picker, with the customer's price list applied. */
export async function catalogueForDocuments(organizationId: string, priceListId: string | null) {
  return withTenant(organizationId, async (tx) => {
    const listPrice = (kind: "product" | "service", idCol: AnyColumn) =>
      priceListId
        ? sql<number | null>`(select price_paise from price_list_items pli where pli.organization_id = ${organizationId} and pli.price_list_id = ${priceListId} and pli.${sql.raw(kind === "product" ? "product_id" : "service_id")} = ${idCol})`
        : sql<null>`null`;
    const prods = await tx
      .select({
        id: products.id,
        name: products.name,
        code: products.sku,
        hsnSac: products.hsnCode,
        ratePaise: products.salePricePaise,
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

/** Customer details the editor needs: default place of supply, terms, price list. */
export async function customerForDocuments(organizationId: string, customerId: string) {
  return withTenant(organizationId, async (tx) => {
    const loaded = await loadCustomer(tx, organizationId, customerId);
    return {
      id: loaded.customer.id,
      name: loaded.customer.name,
      gstin: loaded.customer.gstin,
      archived: !!loaded.customer.archivedAt,
      placeOfSupply: defaultPlaceOfSupply(loaded),
      paymentTermsDays: loaded.customer.paymentTermsDays,
      priceListId: loaded.customer.priceListId,
      billingAddress: loaded.billing,
      shippingAddress: loaded.shipping,
    };
  });
}
