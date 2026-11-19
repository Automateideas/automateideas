import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

// Business Billing: each tenant company's own customer billing.
// Kept apart from the SaaS subscription tables (subscription_payment and the
// organization.seat_limit/plan_status columns); nothing here references them.
//
// Rules every table follows (enforced by schema/business-billing.test.ts,
// schema/financial.test.ts and the database tests):
// - organization_id: required, the tenant, ON DELETE RESTRICT (only
//   configuration tables listed in financial.test.ts may cascade).
// - Links between tables are composite (organization_id, x_id) foreign keys,
//   so a row can never point at another tenant's row.
// - Row-level security: see drizzle/*_business_billing_rls (role billing_tenant)
//   and lib/business-billing/tenant-db.ts. New tables must be added there.
// - Money: whole paise (bigint). Quantities numeric(15,3). Tax rates numeric(7,4).
// - Documents are voided, never deleted; contacts and catalogue are archived.

/* ---------------- Shared column and constraint helpers ---------------- */

const pk = () => text("id").primaryKey().default(sql`gen_random_uuid()::text`);
const tenantId = () =>
  text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "restrict" });
const audit = () => ({
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
const money = (name: string) => bigint(name, { mode: "number" }).default(0).notNull();
const taxRate = (name = "tax_rate") => numeric(name, { precision: 7, scale: 4 }).default("0").notNull();
const quantity = () => numeric("quantity", { precision: 15, scale: 3 }).default("1").notNull();
const address = () => ({
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  // GST state code, e.g. "27" for Maharashtra; decides CGST+SGST vs IGST.
  stateCode: text("state_code"),
  postalCode: text("postal_code"),
  countryCode: text("country_code").default("IN").notNull(),
});

type Tenanted = { organizationId: AnyPgColumn; id: AnyPgColumn };

/** Composite foreign key (organization_id, column) → target (organization_id, id). */
function tenantFk(name: string, org: AnyPgColumn, column: AnyPgColumn, target: Tenanted) {
  return foreignKey({ name, columns: [org, column], foreignColumns: [target.organizationId, target.id] });
}

/** unique (organization_id, id): what composite foreign keys point at. */
const tenantKey = (prefix: string, t: Tenanted) => unique(`${prefix}_org_id_uq`).on(t.organizationId, t.id);

const inList = (column: AnyPgColumn, values: readonly string[]) =>
  sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;

/* ---------------- Company ---------------- */

/** One row per tenant: company details and invoice defaults. Configuration, so it may cascade. */
export const billingSettings = pgTable(
  "billing_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    // India: 15-character GSTIN and 10-character PAN, both optional.
    gstin: text("gstin"),
    pan: text("pan"),
    email: text("email"),
    phone: text("phone"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    countryCode: text("country_code").default("IN").notNull(),
    currency: text("currency").default("INR").notNull(),
    // 1 = January … 12 = December. India's financial year starts in April.
    financialYearStartMonth: integer("financial_year_start_month").default(4).notNull(),
    invoicePrefix: text("invoice_prefix").default("INV-").notNull(),
    // GST state code the business supplies from (from the GSTIN when registered).
    stateCode: text("state_code"),
    // Whether entered prices already include GST (can be changed per document).
    pricesIncludeTax: boolean("prices_include_tax").default(false).notNull(),
    // "nearest_rupee" or "none".
    roundOff: text("round_off").default("nearest_rupee").notNull(),
    // Per document type: { prefix, includeFinancialYear, padding }. See lib/business-billing/numbering.ts.
    documentNumbering: jsonb("document_numbering").default({}).notNull(),
    // Whether documents show the workspace logo (organization.logo, uploaded via /api/organization/logo).
    showLogo: boolean("show_logo").default(false).notNull(),
    // Books are closed up to and including this date: nothing can be posted, issued or paid on or before it.
    booksLockedUntil: date("books_locked_until"),
    // Whether invoices, returns and adjustments may take stock below zero (shown as a warning when allowed).
    allowNegativeStock: boolean("allow_negative_stock").default(true).notNull(),
    // Email and reminder settings, see lib/business-billing/communication/settings.ts.
    communication: jsonb("communication").default({}).notNull(),
    // Design, colour, bank/UPI details, default terms… See lib/business-billing/template.ts.
    documentTemplate: jsonb("document_template").default({}).notNull(),
    // Storage keys (lib/storage.ts) of the signature and stamp images, like organization.logo.
    signatureKey: text("signature_key"),
    stampKey: text("stamp_key"),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("billing_settings_fy_month_check", sql`${table.financialYearStartMonth} between 1 and 12`),
    check("billing_settings_round_off_check", sql`${table.roundOff} in ('nearest_rupee', 'none')`),
  ],
);

/** GST treatment of a product or service. Zero-rated (exports, SEZ) is decided per document. */
export const TAX_CATEGORIES = ["taxable", "exempt", "nil_rated", "non_gst"] as const;

export const companyBranches = pgTable(
  "company_branches",
  {
    id: pk(),
    organizationId: tenantId(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    gstin: text("gstin"),
    ...address(),
    isDefault: boolean("is_default").default(false).notNull(),
    archivedAt: timestamp("archived_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("company_branches", t),
    unique("company_branches_code_uq").on(t.organizationId, t.code),
    uniqueIndex("company_branches_one_default_uq").on(t.organizationId).where(sql`${t.isDefault}`),
  ],
);

export const DOCUMENT_TYPES = [
  "invoice",
  "quotation",
  "sales_order",
  "credit_note",
  "debit_note",
  "payment",
  "refund",
  "purchase_order",
  "purchase_bill",
  "journal_entry",
  "purchase_return",
  "supplier_payment",
  "stock_adjustment",
] as const;

/** One counter per document type, financial year and (optional) branch. */
export const invoiceSequences = pgTable(
  "invoice_sequences",
  {
    id: pk(),
    organizationId: tenantId(),
    // Null: one series for the whole company.
    branchId: text("branch_id"),
    documentType: text("document_type").notNull(),
    // e.g. "2026-27".
    financialYear: text("financial_year").notNull(),
    prefix: text("prefix").default("").notNull(),
    nextNumber: bigint("next_number", { mode: "number" }).default(1).notNull(),
    padding: integer("padding").default(4).notNull(),
    ...audit(),
  },
  (t) => [
    tenantKey("invoice_sequences", t),
    unique("invoice_sequences_series_uq")
      .on(t.organizationId, t.branchId, t.documentType, t.financialYear)
      .nullsNotDistinct(),
    tenantFk("invoice_sequences_branch_fk", t.organizationId, t.branchId, companyBranches),
    check("invoice_sequences_type_check", inList(t.documentType, DOCUMENT_TYPES)),
    check("invoice_sequences_next_check", sql`${t.nextNumber} >= 1`),
    check("invoice_sequences_padding_check", sql`${t.padding} between 1 and 12`),
  ],
);

/* ---------------- Accounting (chart of accounts first: payments use it) ---------------- */

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;

export const accounts = pgTable(
  "accounts",
  {
    id: pk(),
    organizationId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    parentId: text("parent_id"),
    // Receivables, GST payable, sales…: can't be archived or removed.
    isSystem: boolean("is_system").default(false).notNull(),
    // Stable key the app posts to (e.g. "receivables", "output_cgst"), whatever the account is renamed to.
    systemKey: text("system_key"),
    archivedAt: timestamp("archived_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("accounts", t),
    unique("accounts_code_uq").on(t.organizationId, t.code),
    uniqueIndex("accounts_system_key_uq").on(t.organizationId, t.systemKey).where(sql`${t.systemKey} is not null`),
    tenantFk("accounts_parent_fk", t.organizationId, t.parentId, t),
    check("accounts_type_check", inList(t.type, ACCOUNT_TYPES)),
    index("accounts_parent_idx").on(t.organizationId, t.parentId),
  ],
);

/* ---------------- Catalogue ---------------- */

export const units = pgTable(
  "units",
  {
    id: pk(),
    organizationId: tenantId(),
    // GST unit quantity codes: NOS, KGS, MTR, HRS…
    code: text("code").notNull(),
    name: text("name").notNull(),
    decimalPlaces: integer("decimal_places").default(0).notNull(),
    archivedAt: timestamp("archived_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("units", t),
    unique("units_code_uq").on(t.organizationId, t.code),
    check("units_decimals_check", sql`${t.decimalPlaces} between 0 and 3`),
  ],
);

export const productCategories = pgTable(
  "product_categories",
  {
    id: pk(),
    organizationId: tenantId(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("product_categories", t),
    unique("product_categories_name_uq").on(t.organizationId, t.parentId, t.name).nullsNotDistinct(),
    tenantFk("product_categories_parent_fk", t.organizationId, t.parentId, t),
  ],
);

export const products = pgTable(
  "products",
  {
    id: pk(),
    organizationId: tenantId(),
    sku: text("sku"),
    barcode: text("barcode"),
    name: text("name").notNull(),
    description: text("description"),
    brand: text("brand"),
    categoryId: text("category_id"),
    unitId: text("unit_id").notNull(),
    hsnCode: text("hsn_code"),
    taxCategory: text("tax_category").default("taxable").notNull(),
    taxRate: taxRate(),
    // Compensation cess, % of taxable value (tobacco, aerated drinks, cars…).
    cessRate: taxRate("cess_rate"),
    salePricePaise: money("sale_price_paise"),
    purchasePricePaise: money("purchase_price_paise"),
    trackInventory: boolean("track_inventory").default(false).notNull(),
    // Low-stock alert level; only meaningful when trackInventory is on.
    minStockQty: numeric("min_stock_qty", { precision: 15, scale: 3 }),
    archivedAt: timestamp("archived_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("products", t),
    uniqueIndex("products_sku_uq").on(t.organizationId, t.sku).where(sql`${t.sku} is not null`),
    uniqueIndex("products_barcode_uq").on(t.organizationId, t.barcode).where(sql`${t.barcode} is not null`),
    check("products_min_stock_check", sql`${t.minStockQty} is null or ${t.minStockQty} >= 0`),
    tenantFk("products_category_fk", t.organizationId, t.categoryId, productCategories),
    tenantFk("products_unit_fk", t.organizationId, t.unitId, units),
    check("products_tax_rate_check", sql`${t.taxRate} between 0 and 100`),
    check("products_cess_rate_check", sql`${t.cessRate} between 0 and 400`),
    check("products_tax_category_check", inList(t.taxCategory, TAX_CATEGORIES)),
    check("products_prices_check", sql`${t.salePricePaise} >= 0 and ${t.purchasePricePaise} >= 0`),
    index("products_name_idx").on(t.organizationId, t.name),
    index("products_category_idx").on(t.organizationId, t.categoryId),
  ],
);

export const services = pgTable(
  "services",
  {
    id: pk(),
    organizationId: tenantId(),
    code: text("code"),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: text("category_id"),
    unitId: text("unit_id"),
    sacCode: text("sac_code"),
    taxCategory: text("tax_category").default("taxable").notNull(),
    taxRate: taxRate(),
    ratePaise: money("rate_paise"),
    archivedAt: timestamp("archived_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("services", t),
    uniqueIndex("services_code_uq").on(t.organizationId, t.code).where(sql`${t.code} is not null`),
    tenantFk("services_unit_fk", t.organizationId, t.unitId, units),
    tenantFk("services_category_fk", t.organizationId, t.categoryId, productCategories),
    check("services_tax_rate_check", sql`${t.taxRate} between 0 and 100`),
    check("services_tax_category_check", inList(t.taxCategory, TAX_CATEGORIES)),
    check("services_rate_check", sql`${t.ratePaise} >= 0`),
    index("services_name_idx").on(t.organizationId, t.name),
  ],
);

/** Where stock is kept. Each company gets a default "Main warehouse" on first use. */
export const warehouses = pgTable(
  "warehouses",
  {
    id: pk(),
    organizationId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    ...address(),
    isDefault: boolean("is_default").default(false).notNull(),
    archivedAt: timestamp("archived_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("warehouses", t),
    unique("warehouses_code_uq").on(t.organizationId, t.code),
    uniqueIndex("warehouses_one_default_uq").on(t.organizationId).where(sql`${t.isDefault}`),
  ],
);

export const priceLists = pgTable(
  "price_lists",
  {
    id: pk(),
    organizationId: tenantId(),
    name: text("name").notNull(),
    currency: text("currency").default("INR").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    archivedAt: timestamp("archived_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("price_lists", t),
    unique("price_lists_name_uq").on(t.organizationId, t.name),
    uniqueIndex("price_lists_one_default_uq").on(t.organizationId).where(sql`${t.isDefault}`),
  ],
);

/** A price for exactly one product or one service in a price list. */
export const priceListItems = pgTable(
  "price_list_items",
  {
    id: pk(),
    organizationId: tenantId(),
    priceListId: text("price_list_id").notNull(),
    productId: text("product_id"),
    serviceId: text("service_id"),
    pricePaise: money("price_paise"),
    ...audit(),
  },
  (t) => [
    tenantFk("price_list_items_list_fk", t.organizationId, t.priceListId, priceLists).onDelete("cascade"),
    tenantFk("price_list_items_product_fk", t.organizationId, t.productId, products),
    tenantFk("price_list_items_service_fk", t.organizationId, t.serviceId, services),
    check("price_list_items_one_item_check", sql`num_nonnulls(${t.productId}, ${t.serviceId}) = 1`),
    check("price_list_items_price_check", sql`${t.pricePaise} >= 0`),
    uniqueIndex("price_list_items_product_uq")
      .on(t.organizationId, t.priceListId, t.productId)
      .where(sql`${t.productId} is not null`),
    uniqueIndex("price_list_items_service_uq")
      .on(t.organizationId, t.priceListId, t.serviceId)
      .where(sql`${t.serviceId} is not null`),
  ],
);

/* ---------------- Contacts ---------------- */

export const customers = pgTable(
  "customers",
  {
    id: pk(),
    organizationId: tenantId(),
    code: text("code"),
    // "individual" or "business". GST registered = has a GSTIN.
    customerType: text("customer_type").default("business").notNull(),
    name: text("name").notNull(),
    displayName: text("display_name"),
    contactPerson: text("contact_person"),
    category: text("category"),
    gstin: text("gstin"),
    pan: text("pan"),
    email: text("email"),
    phone: text("phone"),
    // GST state code where supply is made, when the customer is in India.
    placeOfSupply: text("place_of_supply"),
    paymentTermsDays: integer("payment_terms_days"),
    creditLimitPaise: bigint("credit_limit_paise", { mode: "number" }),
    openingBalancePaise: money("opening_balance_paise"),
    priceListId: text("price_list_id"),
    notes: text("notes"),
    // Automatic payment reminders (company settings decide when). Manual "send now" ignores this.
    sendReminders: boolean("send_reminders").default(true).notNull(),
    archivedAt: timestamp("archived_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("customers", t),
    uniqueIndex("customers_code_uq").on(t.organizationId, t.code).where(sql`${t.code} is not null`),
    tenantFk("customers_price_list_fk", t.organizationId, t.priceListId, priceLists),
    check("customers_terms_check", sql`${t.paymentTermsDays} is null or ${t.paymentTermsDays} >= 0`),
    check("customers_credit_check", sql`${t.creditLimitPaise} is null or ${t.creditLimitPaise} >= 0`),
    index("customers_name_idx").on(t.organizationId, t.name),
    index("customers_gstin_idx").on(t.organizationId, t.gstin),
    check("customers_type_check", inList(t.customerType, ["individual", "business"])),
    // One active customer per GSTIN (duplicate prevention).
    uniqueIndex("customers_active_gstin_uq")
      .on(t.organizationId, t.gstin)
      .where(sql`${t.gstin} is not null and ${t.archivedAt} is null`),
  ],
);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: pk(),
    organizationId: tenantId(),
    customerId: text("customer_id").notNull(),
    type: text("type").notNull(),
    label: text("label"),
    ...address(),
    isDefault: boolean("is_default").default(false).notNull(),
    ...audit(),
  },
  (t) => [
    tenantFk("customer_addresses_customer_fk", t.organizationId, t.customerId, customers).onDelete("cascade"),
    check("customer_addresses_type_check", inList(t.type, ["billing", "shipping"])),
    uniqueIndex("customer_addresses_one_default_uq")
      .on(t.organizationId, t.customerId, t.type)
      .where(sql`${t.isDefault}`),
    index("customer_addresses_customer_idx").on(t.organizationId, t.customerId),
  ],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: pk(),
    organizationId: tenantId(),
    code: text("code"),
    name: text("name").notNull(),
    displayName: text("display_name"),
    contactPerson: text("contact_person"),
    gstin: text("gstin"),
    pan: text("pan"),
    email: text("email"),
    phone: text("phone"),
    ...address(),
    bankName: text("bank_name"),
    bankAccountName: text("bank_account_name"),
    bankAccountNumber: text("bank_account_number"),
    bankIfsc: text("bank_ifsc"),
    paymentTermsDays: integer("payment_terms_days"),
    openingBalancePaise: money("opening_balance_paise"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("suppliers", t),
    uniqueIndex("suppliers_code_uq").on(t.organizationId, t.code).where(sql`${t.code} is not null`),
    check("suppliers_terms_check", sql`${t.paymentTermsDays} is null or ${t.paymentTermsDays} >= 0`),
    index("suppliers_name_idx").on(t.organizationId, t.name),
    index("suppliers_gstin_idx").on(t.organizationId, t.gstin),
    uniqueIndex("suppliers_active_gstin_uq")
      .on(t.organizationId, t.gstin)
      .where(sql`${t.gstin} is not null and ${t.archivedAt} is null`),
  ],
);

/* ---------------- Documents (sales and purchases) ---------------- */

/** Columns every sales and purchase document has. */
const documentColumns = () => ({
  id: pk(),
  organizationId: tenantId(),
  branchId: text("branch_id"),
  // Assigned when the document is issued; drafts may have none.
  number: text("number"),
  issueDate: date("issue_date").notNull(),
  status: text("status").notNull(),
  // GST state code of the place of supply.
  placeOfSupply: text("place_of_supply"),
  currency: text("currency").default("INR").notNull(),
  subtotalPaise: money("subtotal_paise"),
  discountPaise: money("discount_paise"),
  taxPaise: money("tax_paise"),
  roundOffPaise: money("round_off_paise"),
  totalPaise: money("total_paise"),
  // GST inputs and breakdown (calculated by lib/business-billing/tax/gst.ts on the server).
  pricesIncludeTax: boolean("prices_include_tax").default(false).notNull(),
  reverseCharge: boolean("reverse_charge").default(false).notNull(),
  // null, "lut" or "with_payment" (exports and SEZ).
  zeroRated: text("zero_rated"),
  supplyType: text("supply_type"),
  // { type: "percent" | "amount", value } as entered.
  invoiceDiscount: jsonb("invoice_discount"),
  // Additional charges with their calculated tax.
  charges: jsonb("charges").default([]).notNull(),
  taxablePaise: money("taxable_paise"),
  cgstPaise: money("cgst_paise"),
  sgstPaise: money("sgst_paise"),
  igstPaise: money("igst_paise"),
  cessPaise: money("cess_paise"),
  // Copy of the seller's details (name, GSTIN, address, logo) when issued.
  seller: jsonb("seller"),
  financialYear: text("financial_year"),
  sequenceNumber: bigint("sequence_number", { mode: "number" }),
  issuedAt: timestamp("issued_at"),
  notes: text("notes"),
  terms: text("terms"),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"),
  ...audit(),
});

/** Copies of the customer's details at the time of the document. */
const partySnapshot = () => ({
  partyName: text("party_name"),
  partyGstin: text("party_gstin"),
  billingAddress: jsonb("billing_address"),
  shippingAddress: jsonb("shipping_address"),
});

type DocumentCols = Tenanted & {
  branchId: AnyPgColumn;
  number: AnyPgColumn;
  issueDate: AnyPgColumn;
  status: AnyPgColumn;
  subtotalPaise: AnyPgColumn;
  discountPaise: AnyPgColumn;
  taxPaise: AnyPgColumn;
  totalPaise: AnyPgColumn;
};

/** Keys, checks and indexes every document has. `party` is customer_id or supplier_id. */
function documentConstraints(p: string, t: DocumentCols, party: AnyPgColumn, partyTable: Tenanted, statuses: readonly string[]) {
  return [
    tenantKey(p, t),
    uniqueIndex(`${p}_number_uq`).on(t.organizationId, t.number).where(sql`${t.number} is not null`),
    tenantFk(`${p}_branch_fk`, t.organizationId, t.branchId, companyBranches),
    tenantFk(`${p}_party_fk`, t.organizationId, party, partyTable),
    check(`${p}_status_check`, inList(t.status, statuses)),
    check(
      `${p}_amounts_check`,
      sql`${t.subtotalPaise} >= 0 and ${t.discountPaise} >= 0 and ${t.taxPaise} >= 0 and ${t.totalPaise} >= 0`,
    ),
    index(`${p}_date_idx`).on(t.organizationId, t.issueDate),
    index(`${p}_status_idx`).on(t.organizationId, t.status),
    index(`${p}_party_idx`).on(t.organizationId, party),
  ];
}

/** Columns every document line has. Product details are copied at the time of billing. */
const itemColumns = () => ({
  id: pk(),
  organizationId: tenantId(),
  lineNo: integer("line_no").notNull(),
  productId: text("product_id"),
  serviceId: text("service_id"),
  description: text("description").notNull(),
  hsnSac: text("hsn_sac"),
  quantity: quantity(),
  unitCode: text("unit_code"),
  ratePaise: money("rate_paise"),
  // { type: "percent" | "amount", value } as entered; discountPaise is the result.
  discount: jsonb("discount"),
  discountPaise: money("discount_paise"),
  grossPaise: money("gross_paise"),
  // This line's share of the invoice discount.
  invoiceDiscountPaise: money("invoice_discount_paise"),
  taxCategory: text("tax_category").default("taxable").notNull(),
  taxRate: taxRate(),
  cessRate: taxRate("cess_rate"),
  taxablePaise: money("taxable_paise"),
  cgstPaise: money("cgst_paise"),
  sgstPaise: money("sgst_paise"),
  igstPaise: money("igst_paise"),
  cessPaise: money("cess_paise"),
  totalPaise: money("total_paise"),
  ...audit(),
});

type ItemCols = {
  organizationId: AnyPgColumn;
  lineNo: AnyPgColumn;
  productId: AnyPgColumn;
  serviceId: AnyPgColumn;
  quantity: AnyPgColumn;
  ratePaise: AnyPgColumn;
  discountPaise: AnyPgColumn;
  taxRate: AnyPgColumn;
  totalPaise: AnyPgColumn;
};

function itemConstraints(p: string, t: ItemCols, parent: AnyPgColumn, parentTable: Tenanted) {
  return [
    tenantFk(`${p}_parent_fk`, t.organizationId, parent, parentTable).onDelete("cascade"),
    tenantFk(`${p}_product_fk`, t.organizationId, t.productId, products),
    tenantFk(`${p}_service_fk`, t.organizationId, t.serviceId, services),
    unique(`${p}_line_uq`).on(t.organizationId, parent, t.lineNo),
    check(`${p}_one_item_check`, sql`num_nonnulls(${t.productId}, ${t.serviceId}) <= 1`),
    check(`${p}_line_no_check`, sql`${t.lineNo} >= 1`),
    check(`${p}_quantity_check`, sql`${t.quantity} >= 0`),
    check(`${p}_amounts_check`, sql`${t.ratePaise} >= 0 and ${t.discountPaise} >= 0 and ${t.totalPaise} >= 0`),
    check(`${p}_tax_rate_check`, sql`${t.taxRate} between 0 and 100`),
    index(`${p}_parent_idx`).on(t.organizationId, parent),
    index(`${p}_product_idx`).on(t.organizationId, t.productId),
  ];
}

/* ---------------- Sales ---------------- */

export const QUOTATION_STATUSES = ["draft", "sent", "accepted", "declined", "expired", "converted", "void"] as const;
export const SALES_ORDER_STATUSES = ["draft", "confirmed", "fulfilled", "invoiced", "void"] as const;
export const INVOICE_STATUSES = ["draft", "issued", "partially_paid", "paid", "void"] as const;
export const NOTE_STATUSES = ["draft", "issued", "void"] as const;

export const quotations = pgTable(
  "quotations",
  {
    ...documentColumns(),
    customerId: text("customer_id").notNull(),
    ...partySnapshot(),
    validUntil: date("valid_until"),
  },
  (t) => [...documentConstraints("quotations", t, t.customerId, customers, QUOTATION_STATUSES)],
);

export const salesOrders = pgTable(
  "sales_orders",
  {
    ...documentColumns(),
    customerId: text("customer_id").notNull(),
    ...partySnapshot(),
    quotationId: text("quotation_id"),
    expectedDate: date("expected_date"),
  },
  (t) => [
    ...documentConstraints("sales_orders", t, t.customerId, customers, SALES_ORDER_STATUSES),
    tenantFk("sales_orders_quotation_fk", t.organizationId, t.quotationId, quotations),
  ],
);

export const RECURRING_FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export const RECURRING_STATUSES = ["active", "paused", "ended"] as const;

/**
 * A schedule that creates an invoice for a customer every week, month,
 * quarter or year, from a template (lines, discounts, notes) copied from an
 * invoice. See lib/business-billing/recurring.
 */
export const recurringInvoices = pgTable(
  "recurring_invoices",
  {
    id: pk(),
    organizationId: tenantId(),
    name: text("name").notNull(),
    customerId: text("customer_id").notNull(),
    // DocumentValues without the customer and dates (lib/business-billing/documents/validation.ts).
    template: jsonb("template").notNull(),
    // Total of one invoice from the template when it was saved, for lists.
    totalPaise: money("total_paise"),
    frequency: text("frequency").notNull(),
    // Every N weeks / months / quarters / years.
    interval: integer("interval").default(1).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    maxCount: integer("max_count"),
    // Date of the next invoice; null once ended.
    nextRunDate: date("next_run_date"),
    generatedCount: integer("generated_count").default(0).notNull(),
    lastRunDate: date("last_run_date"),
    // Days from invoice date to due date; null = the customer's payment terms.
    dueDays: integer("due_days"),
    autoIssue: boolean("auto_issue").default(true).notNull(),
    autoEmail: boolean("auto_email").default(false).notNull(),
    status: text("status").default("active").notNull(),
    sourceInvoiceId: text("source_invoice_id"),
    ...audit(),
  },
  (t) => [
    tenantKey("recurring_invoices", t),
    tenantFk("recurring_invoices_customer_fk", t.organizationId, t.customerId, customers),
    check("recurring_invoices_frequency_check", inList(t.frequency, RECURRING_FREQUENCIES)),
    check("recurring_invoices_status_check", inList(t.status, RECURRING_STATUSES)),
    check("recurring_invoices_interval_check", sql`${t.interval} between 1 and 52`),
    check("recurring_invoices_end_check", sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    check("recurring_invoices_max_check", sql`${t.maxCount} is null or ${t.maxCount} >= 1`),
    check("recurring_invoices_due_check", sql`${t.dueDays} is null or ${t.dueDays} between 0 and 365`),
    index("recurring_invoices_next_idx").on(t.organizationId, t.status, t.nextRunDate),
  ],
);

export const businessInvoices = pgTable(
  "business_invoices",
  {
    ...documentColumns(),
    customerId: text("customer_id").notNull(),
    ...partySnapshot(),
    dueDate: date("due_date"),
    quotationId: text("quotation_id"),
    salesOrderId: text("sales_order_id"),
    // Where the goods leave from (products that track stock). Set on issue; default warehouse when empty.
    warehouseId: text("warehouse_id"),
    // The recurring invoice that created this one, if any.
    recurringInvoiceId: text("recurring_invoice_id"),
  },
  (t) => [
    ...documentConstraints("business_invoices", t, t.customerId, customers, INVOICE_STATUSES),
    tenantFk("business_invoices_warehouse_fk", t.organizationId, t.warehouseId, warehouses),
    tenantFk("business_invoices_recurring_fk", t.organizationId, t.recurringInvoiceId, recurringInvoices),
    index("business_invoices_recurring_idx").on(t.organizationId, t.recurringInvoiceId),
    tenantFk("business_invoices_quotation_fk", t.organizationId, t.quotationId, quotations),
    tenantFk("business_invoices_sales_order_fk", t.organizationId, t.salesOrderId, salesOrders),
    check("business_invoices_due_check", sql`${t.dueDate} is null or ${t.dueDate} >= ${t.issueDate}`),
    index("business_invoices_due_idx").on(t.organizationId, t.dueDate),
  ],
);

export const creditNotes = pgTable(
  "credit_notes",
  {
    ...documentColumns(),
    customerId: text("customer_id").notNull(),
    ...partySnapshot(),
    invoiceId: text("invoice_id"),
    reason: text("reason"),
    // Goods came back (sales return): stock goes up. Off for price-only credit notes (discounts, rate corrections).
    restock: boolean("restock").default(true).notNull(),
    warehouseId: text("warehouse_id"),
  },
  (t) => [
    ...documentConstraints("credit_notes", t, t.customerId, customers, NOTE_STATUSES),
    tenantFk("credit_notes_warehouse_fk", t.organizationId, t.warehouseId, warehouses),
    tenantFk("credit_notes_invoice_fk", t.organizationId, t.invoiceId, businessInvoices),
    index("credit_notes_invoice_idx").on(t.organizationId, t.invoiceId),
  ],
);

export const debitNotes = pgTable(
  "debit_notes",
  {
    ...documentColumns(),
    customerId: text("customer_id").notNull(),
    ...partySnapshot(),
    invoiceId: text("invoice_id"),
    reason: text("reason"),
  },
  (t) => [
    ...documentConstraints("debit_notes", t, t.customerId, customers, NOTE_STATUSES),
    tenantFk("debit_notes_invoice_fk", t.organizationId, t.invoiceId, businessInvoices),
    index("debit_notes_invoice_idx").on(t.organizationId, t.invoiceId),
  ],
);

export const quotationItems = pgTable("quotation_items", { ...itemColumns(), quotationId: text("quotation_id").notNull() }, (t) => [
  ...itemConstraints("quotation_items", t, t.quotationId, quotations),
]);
export const salesOrderItems = pgTable("sales_order_items", { ...itemColumns(), salesOrderId: text("sales_order_id").notNull() }, (t) => [
  ...itemConstraints("sales_order_items", t, t.salesOrderId, salesOrders),
]);
export const businessInvoiceItems = pgTable("business_invoice_items", { ...itemColumns(), invoiceId: text("invoice_id").notNull() }, (t) => [
  ...itemConstraints("business_invoice_items", t, t.invoiceId, businessInvoices),
]);
export const creditNoteItems = pgTable("credit_note_items", { ...itemColumns(), creditNoteId: text("credit_note_id").notNull() }, (t) => [
  ...itemConstraints("credit_note_items", t, t.creditNoteId, creditNotes),
]);
export const debitNoteItems = pgTable("debit_note_items", { ...itemColumns(), debitNoteId: text("debit_note_id").notNull() }, (t) => [
  ...itemConstraints("debit_note_items", t, t.debitNoteId, debitNotes),
]);

/* ---------------- Purchasing ---------------- */

export const PURCHASE_ORDER_STATUSES = ["draft", "sent", "received", "billed", "void"] as const;
export const PURCHASE_BILL_STATUSES = ["draft", "recorded", "partially_paid", "paid", "void"] as const;

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    ...documentColumns(),
    supplierId: text("supplier_id").notNull(),
    ...partySnapshot(),
    expectedDate: date("expected_date"),
  },
  (t) => [...documentConstraints("purchase_orders", t, t.supplierId, suppliers, PURCHASE_ORDER_STATUSES)],
);

export const purchaseBills = pgTable(
  "purchase_bills",
  {
    ...documentColumns(),
    supplierId: text("supplier_id").notNull(),
    ...partySnapshot(),
    // The supplier's own bill number, as printed on their bill.
    supplierBillNumber: text("supplier_bill_number"),
    dueDate: date("due_date"),
    purchaseOrderId: text("purchase_order_id"),
    // Where the goods arrive (products that track stock).
    warehouseId: text("warehouse_id"),
  },
  (t) => [
    ...documentConstraints("purchase_bills", t, t.supplierId, suppliers, PURCHASE_BILL_STATUSES),
    tenantFk("purchase_bills_warehouse_fk", t.organizationId, t.warehouseId, warehouses),
    tenantFk("purchase_bills_order_fk", t.organizationId, t.purchaseOrderId, purchaseOrders),
    uniqueIndex("purchase_bills_supplier_number_uq")
      .on(t.organizationId, t.supplierId, t.supplierBillNumber)
      .where(sql`${t.supplierBillNumber} is not null`),
    check("purchase_bills_due_check", sql`${t.dueDate} is null or ${t.dueDate} >= ${t.issueDate}`),
    index("purchase_bills_due_idx").on(t.organizationId, t.dueDate),
  ],
);

export const purchaseOrderItems = pgTable("purchase_order_items", { ...itemColumns(), purchaseOrderId: text("purchase_order_id").notNull() }, (t) => [
  ...itemConstraints("purchase_order_items", t, t.purchaseOrderId, purchaseOrders),
]);
export const purchaseBillItems = pgTable("purchase_bill_items", { ...itemColumns(), purchaseBillId: text("purchase_bill_id").notNull() }, (t) => [
  ...itemConstraints("purchase_bill_items", t, t.purchaseBillId, purchaseBills),
]);

/** Goods sent back to a supplier (a debit note to the supplier), against one of their bills. */
export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    ...documentColumns(),
    supplierId: text("supplier_id").notNull(),
    ...partySnapshot(),
    purchaseBillId: text("purchase_bill_id"),
    reason: text("reason"),
    warehouseId: text("warehouse_id"),
  },
  (t) => [
    ...documentConstraints("purchase_returns", t, t.supplierId, suppliers, NOTE_STATUSES),
    tenantFk("purchase_returns_warehouse_fk", t.organizationId, t.warehouseId, warehouses),
    tenantFk("purchase_returns_bill_fk", t.organizationId, t.purchaseBillId, purchaseBills),
    index("purchase_returns_bill_idx").on(t.organizationId, t.purchaseBillId),
  ],
);

export const purchaseReturnItems = pgTable("purchase_return_items", { ...itemColumns(), purchaseReturnId: text("purchase_return_id").notNull() }, (t) => [
  ...itemConstraints("purchase_return_items", t, t.purchaseReturnId, purchaseReturns),
]);

/* ---------------- Inventory ---------------- */

export const STOCK_MOVEMENT_KINDS = ["purchase", "purchase_return", "sale", "sales_return", "adjustment", "transfer_out", "transfer_in"] as const;
export const STOCK_ADJUSTMENT_REASONS = ["opening", "count", "damaged", "lost", "expired", "found", "internal_use", "other"] as const;

/**
 * Every change to stock, one row per product, warehouse and event. Posted
 * records: never changed or deleted (drizzle/*_inventory_rls_and_locks); a voided
 * invoice, bill or adjustment gets an opposite movement instead.
 *
 * Value is the change in stock value at weighted average cost: a purchase
 * adds its taxable cost, a sale removes quantity × average cost at that time.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: pk(),
    organizationId: tenantId(),
    warehouseId: text("warehouse_id").notNull(),
    productId: text("product_id").notNull(),
    movementDate: date("movement_date").notNull(),
    kind: text("kind").notNull(),
    // Signed: in > 0, out < 0.
    quantity: numeric("quantity", { precision: 15, scale: 3 }).notNull(),
    // Signed change in stock value, paise.
    valuePaise: bigint("value_paise", { mode: "number" }).notNull(),
    // What caused it: "document:invoices", "stock_adjustment"…
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceLineId: text("source_line_id"),
    reversesMovementId: text("reverses_movement_id"),
    note: text("note"),
    ...audit(),
  },
  (t) => [
    tenantKey("stock_movements", t),
    tenantFk("stock_movements_warehouse_fk", t.organizationId, t.warehouseId, warehouses),
    tenantFk("stock_movements_product_fk", t.organizationId, t.productId, products),
    tenantFk("stock_movements_reverses_fk", t.organizationId, t.reversesMovementId, t),
    check("stock_movements_kind_check", inList(t.kind, STOCK_MOVEMENT_KINDS)),
    check("stock_movements_quantity_check", sql`${t.quantity} <> 0`),
    // A movement is reversed at most once.
    uniqueIndex("stock_movements_one_reversal_uq").on(t.organizationId, t.reversesMovementId).where(sql`${t.reversesMovementId} is not null`),
    index("stock_movements_product_idx").on(t.organizationId, t.productId, t.warehouseId, t.movementDate),
    index("stock_movements_source_idx").on(t.organizationId, t.sourceType, t.sourceId),
  ],
);

export const STOCK_ADJUSTMENT_STATUSES = ["posted", "void"] as const;

/** A stock count correction, opening stock, write-off or transfer between warehouses. */
export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: pk(),
    organizationId: tenantId(),
    number: text("number").notNull(),
    adjustmentDate: date("adjustment_date").notNull(),
    // "adjustment" (quantities up or down in one warehouse) or "transfer" (from → to).
    kind: text("kind").notNull(),
    warehouseId: text("warehouse_id").notNull(),
    toWarehouseId: text("to_warehouse_id"),
    reason: text("reason"),
    notes: text("notes"),
    status: text("status").default("posted").notNull(),
    voidedAt: timestamp("voided_at"),
    voidReason: text("void_reason"),
    idempotencyKey: text("idempotency_key"),
    ...audit(),
  },
  (t) => [
    tenantKey("stock_adjustments", t),
    unique("stock_adjustments_number_uq").on(t.organizationId, t.number),
    uniqueIndex("stock_adjustments_idempotency_uq").on(t.organizationId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    tenantFk("stock_adjustments_warehouse_fk", t.organizationId, t.warehouseId, warehouses),
    tenantFk("stock_adjustments_to_warehouse_fk", t.organizationId, t.toWarehouseId, warehouses),
    check("stock_adjustments_kind_check", sql`${t.kind} in ('adjustment', 'transfer')`),
    check("stock_adjustments_status_check", inList(t.status, STOCK_ADJUSTMENT_STATUSES)),
    check("stock_adjustments_reason_check", sql`${t.reason} is null or ${inList(t.reason, STOCK_ADJUSTMENT_REASONS)}`),
    check(
      "stock_adjustments_transfer_check",
      sql`(${t.kind} = 'transfer' and ${t.toWarehouseId} is not null and ${t.toWarehouseId} <> ${t.warehouseId}) or (${t.kind} = 'adjustment' and ${t.toWarehouseId} is null)`,
    ),
    index("stock_adjustments_date_idx").on(t.organizationId, t.adjustmentDate),
  ],
);

export const stockAdjustmentItems = pgTable(
  "stock_adjustment_items",
  {
    id: pk(),
    organizationId: tenantId(),
    adjustmentId: text("adjustment_id").notNull(),
    lineNo: integer("line_no").notNull(),
    productId: text("product_id").notNull(),
    // Adjustments: signed (+ adds, − removes). Transfers: the quantity moved (> 0).
    quantity: numeric("quantity", { precision: 15, scale: 3 }).notNull(),
    // Cost per unit for stock added (opening stock, found items); null = current average cost.
    unitCostPaise: bigint("unit_cost_paise", { mode: "number" }),
    note: text("note"),
    ...audit(),
  },
  (t) => [
    tenantKey("stock_adjustment_items", t),
    tenantFk("stock_adjustment_items_adjustment_fk", t.organizationId, t.adjustmentId, stockAdjustments),
    tenantFk("stock_adjustment_items_product_fk", t.organizationId, t.productId, products),
    unique("stock_adjustment_items_line_uq").on(t.organizationId, t.adjustmentId, t.lineNo),
    check("stock_adjustment_items_quantity_check", sql`${t.quantity} <> 0`),
    check("stock_adjustment_items_cost_check", sql`${t.unitCostPaise} is null or ${t.unitCostPaise} >= 0`),
  ],
);

/* ---------------- Payments ---------------- */

export const PAYMENT_METHODS = ["cash", "bank_transfer", "upi", "card", "cheque", "other"] as const;

/** Money received from customers or paid to suppliers. */
export const businessPayments = pgTable(
  "business_payments",
  {
    id: pk(),
    organizationId: tenantId(),
    direction: text("direction").notNull(),
    customerId: text("customer_id"),
    supplierId: text("supplier_id"),
    // Bank or cash account the money went into or came from.
    accountId: text("account_id"),
    number: text("number"),
    paymentDate: date("payment_date").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    status: text("status").default("recorded").notNull(),
    voidedAt: timestamp("voided_at"),
    voidReason: text("void_reason"),
    // Sent by the client with each submit, so a retried request records nothing twice.
    idempotencyKey: text("idempotency_key"),
    ...audit(),
  },
  (t) => [
    tenantKey("business_payments", t),
    uniqueIndex("business_payments_idempotency_uq").on(t.organizationId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    uniqueIndex("business_payments_number_uq").on(t.organizationId, t.number).where(sql`${t.number} is not null`),
    tenantFk("business_payments_customer_fk", t.organizationId, t.customerId, customers),
    tenantFk("business_payments_supplier_fk", t.organizationId, t.supplierId, suppliers),
    tenantFk("business_payments_account_fk", t.organizationId, t.accountId, accounts),
    check(
      "business_payments_party_check",
      sql`(${t.direction} = 'received' and ${t.customerId} is not null and ${t.supplierId} is null)
        or (${t.direction} = 'made' and ${t.supplierId} is not null and ${t.customerId} is null)`,
    ),
    check("business_payments_amount_check", sql`${t.amountPaise} > 0`),
    check("business_payments_method_check", inList(t.method, PAYMENT_METHODS)),
    check("business_payments_status_check", inList(t.status, ["recorded", "void"])),
    index("business_payments_date_idx").on(t.organizationId, t.paymentDate),
    index("business_payments_customer_idx").on(t.organizationId, t.customerId),
    index("business_payments_supplier_idx").on(t.organizationId, t.supplierId),
  ],
);

/** How much of a payment settles one invoice or one purchase bill. */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: pk(),
    organizationId: tenantId(),
    paymentId: text("payment_id").notNull(),
    invoiceId: text("invoice_id"),
    purchaseBillId: text("purchase_bill_id"),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    ...audit(),
  },
  (t) => [
    tenantFk("payment_allocations_payment_fk", t.organizationId, t.paymentId, businessPayments).onDelete("cascade"),
    tenantFk("payment_allocations_invoice_fk", t.organizationId, t.invoiceId, businessInvoices),
    tenantFk("payment_allocations_bill_fk", t.organizationId, t.purchaseBillId, purchaseBills),
    check("payment_allocations_one_target_check", sql`num_nonnulls(${t.invoiceId}, ${t.purchaseBillId}) = 1`),
    check("payment_allocations_amount_check", sql`${t.amountPaise} > 0`),
    uniqueIndex("payment_allocations_invoice_uq")
      .on(t.organizationId, t.paymentId, t.invoiceId)
      .where(sql`${t.invoiceId} is not null`),
    uniqueIndex("payment_allocations_bill_uq")
      .on(t.organizationId, t.paymentId, t.purchaseBillId)
      .where(sql`${t.purchaseBillId} is not null`),
    index("payment_allocations_invoice_idx").on(t.organizationId, t.invoiceId),
    index("payment_allocations_bill_idx").on(t.organizationId, t.purchaseBillId),
  ],
);

/** Money returned to a customer, from an earlier payment and/or for a credit note. */
export const refunds = pgTable(
  "refunds",
  {
    id: pk(),
    organizationId: tenantId(),
    customerId: text("customer_id").notNull(),
    paymentId: text("payment_id"),
    creditNoteId: text("credit_note_id"),
    accountId: text("account_id"),
    number: text("number"),
    refundDate: date("refund_date").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    status: text("status").default("recorded").notNull(),
    voidedAt: timestamp("voided_at"),
    voidReason: text("void_reason"),
    // Sent by the client with each submit, so a retried request records nothing twice.
    idempotencyKey: text("idempotency_key"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("refunds_number_uq").on(t.organizationId, t.number).where(sql`${t.number} is not null`),
    tenantFk("refunds_customer_fk", t.organizationId, t.customerId, customers),
    tenantFk("refunds_payment_fk", t.organizationId, t.paymentId, businessPayments),
    tenantFk("refunds_credit_note_fk", t.organizationId, t.creditNoteId, creditNotes),
    tenantFk("refunds_account_fk", t.organizationId, t.accountId, accounts),
    check("refunds_source_check", sql`num_nonnulls(${t.paymentId}, ${t.creditNoteId}) >= 1`),
    check("refunds_amount_check", sql`${t.amountPaise} > 0`),
    check("refunds_method_check", inList(t.method, PAYMENT_METHODS)),
    check("refunds_status_check", inList(t.status, ["recorded", "void"])),
    index("refunds_customer_idx").on(t.organizationId, t.customerId),
    index("refunds_date_idx").on(t.organizationId, t.refundDate),
    uniqueIndex("refunds_idempotency_uq").on(t.organizationId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    index("refunds_payment_idx").on(t.organizationId, t.paymentId),
    index("refunds_credit_note_idx").on(t.organizationId, t.creditNoteId),
  ],
);

/* ---------------- Journal ---------------- */

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: pk(),
    organizationId: tenantId(),
    number: text("number"),
    entryDate: date("entry_date").notNull(),
    narration: text("narration"),
    // What created it: "invoice", "payment", "manual"…
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    // Posted entries are never edited; mistakes get a reversing entry.
    postedAt: timestamp("posted_at"),
    reversesEntryId: text("reverses_entry_id"),
    // Manual entries: one per submit, so a double click or retry can't post twice.
    idempotencyKey: text("idempotency_key"),
    ...audit(),
  },
  (t) => [
    tenantKey("journal_entries", t),
    uniqueIndex("journal_entries_idempotency_uq").on(t.organizationId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    uniqueIndex("journal_entries_number_uq").on(t.organizationId, t.number).where(sql`${t.number} is not null`),
    tenantFk("journal_entries_reverses_fk", t.organizationId, t.reversesEntryId, t),
    // An entry can be reversed only once.
    uniqueIndex("journal_entries_one_reversal_uq")
      .on(t.organizationId, t.reversesEntryId)
      .where(sql`${t.reversesEntryId} is not null`),
    index("journal_entries_date_idx").on(t.organizationId, t.entryDate),
    index("journal_entries_source_idx").on(t.organizationId, t.sourceType, t.sourceId),
    // One original posting per document or payment (reversals and adjustments are separate).
    uniqueIndex("journal_entries_one_posting_uq")
      .on(t.organizationId, t.sourceType, t.sourceId)
      .where(sql`${t.sourceId} is not null and ${t.reversesEntryId} is null and ${t.sourceType} not in ('manual', 'opening')`),
  ],
);

/** One debit or one credit. Balancing (debits = credits) is added with accounting. */
export const journalLines = pgTable(
  "journal_lines",
  {
    id: pk(),
    organizationId: tenantId(),
    entryId: text("entry_id").notNull(),
    lineNo: integer("line_no").notNull(),
    accountId: text("account_id").notNull(),
    customerId: text("customer_id"),
    supplierId: text("supplier_id"),
    debitPaise: money("debit_paise"),
    creditPaise: money("credit_paise"),
    description: text("description"),
    ...audit(),
  },
  (t) => [
    tenantFk("journal_lines_entry_fk", t.organizationId, t.entryId, journalEntries).onDelete("cascade"),
    tenantFk("journal_lines_account_fk", t.organizationId, t.accountId, accounts),
    tenantFk("journal_lines_customer_fk", t.organizationId, t.customerId, customers),
    tenantFk("journal_lines_supplier_fk", t.organizationId, t.supplierId, suppliers),
    unique("journal_lines_line_uq").on(t.organizationId, t.entryId, t.lineNo),
    check(
      "journal_lines_side_check",
      sql`(${t.debitPaise} > 0 and ${t.creditPaise} = 0) or (${t.creditPaise} > 0 and ${t.debitPaise} = 0)`,
    ),
    check("journal_lines_one_party_check", sql`num_nonnulls(${t.customerId}, ${t.supplierId}) <= 1`),
    index("journal_lines_entry_idx").on(t.organizationId, t.entryId),
    index("journal_lines_account_idx").on(t.organizationId, t.accountId),
    index("journal_lines_customer_idx").on(t.organizationId, t.customerId),
    index("journal_lines_supplier_idx").on(t.organizationId, t.supplierId),
  ],
);

export const RECURRING_RUN_STATUSES = ["created", "issued", "emailed", "failed"] as const;

/** One row per scheduled date of a recurring invoice: what was created, and what went wrong. */
export const recurringInvoiceRuns = pgTable(
  "recurring_invoice_runs",
  {
    id: pk(),
    organizationId: tenantId(),
    recurringInvoiceId: text("recurring_invoice_id").notNull(),
    runDate: date("run_date").notNull(),
    invoiceId: text("invoice_id"),
    status: text("status").notNull(),
    error: text("error"),
    ...audit(),
  },
  (t) => [
    tenantKey("recurring_invoice_runs", t),
    tenantFk("recurring_invoice_runs_profile_fk", t.organizationId, t.recurringInvoiceId, recurringInvoices),
    tenantFk("recurring_invoice_runs_invoice_fk", t.organizationId, t.invoiceId, businessInvoices),
    // Never two invoices for the same scheduled date.
    unique("recurring_invoice_runs_date_uq").on(t.organizationId, t.recurringInvoiceId, t.runDate),
    check("recurring_invoice_runs_status_check", inList(t.status, RECURRING_RUN_STATUSES)),
  ],
);

/* ---------------- Communication ---------------- */

/**
 * A secret link that lets someone without a login view and download one
 * document's PDF (sent by email or WhatsApp). Only a SHA-256 hash of the
 * token is stored. RLS also lets a request holding the token read just its
 * own row (drizzle/*_communication_rls_and_locks).
 */
export const documentShares = pgTable(
  "document_shares",
  {
    id: pk(),
    organizationId: tenantId(),
    // Document slug ("invoices", "quotations"…) or "receipt" for a payment receipt.
    documentType: text("document_type").notNull(),
    documentId: text("document_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    views: integer("views").default(0).notNull(),
    lastViewedAt: timestamp("last_viewed_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("document_shares", t),
    uniqueIndex("document_shares_token_uq").on(t.tokenHash),
    index("document_shares_document_idx").on(t.organizationId, t.documentType, t.documentId),
  ],
);

export const MESSAGE_CHANNELS = ["email", "whatsapp"] as const;
export const MESSAGE_STATUSES = ["sending", "sent", "delivered", "read", "failed", "logged"] as const;

/**
 * Every invoice, receipt or reminder sent to a customer. A dedupe key (e.g.
 * "reminder:<invoice>:after-2") stops the scheduled job sending the same
 * reminder twice, even if it runs twice at once.
 */
export const billingMessages = pgTable(
  "billing_messages",
  {
    id: pk(),
    organizationId: tenantId(),
    channel: text("channel").notNull(),
    // "document", "receipt", "reminder".
    kind: text("kind").notNull(),
    documentType: text("document_type").notNull(),
    documentId: text("document_id").notNull(),
    customerId: text("customer_id"),
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    dedupeKey: text("dedupe_key"),
    ...audit(),
  },
  (t) => [
    tenantKey("billing_messages", t),
    tenantFk("billing_messages_customer_fk", t.organizationId, t.customerId, customers),
    check("billing_messages_channel_check", inList(t.channel, MESSAGE_CHANNELS)),
    check("billing_messages_status_check", inList(t.status, MESSAGE_STATUSES)),
    uniqueIndex("billing_messages_dedupe_uq").on(t.organizationId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
    index("billing_messages_document_idx").on(t.organizationId, t.documentType, t.documentId),
  ],
);

export const WHATSAPP_CONNECTION_STATUSES = ["connected", "error", "disconnected"] as const;

/**
 * A company's own WhatsApp Business number, connected through Meta's
 * Embedded Signup (option B). The access token is encrypted
 * (lib/crypto/secret-box.ts); without a connection, the company can use
 * the shared Automate Ideas number (option A) if the server has one.
 */
export const whatsappConnections = pgTable(
  "whatsapp_connections",
  {
    id: pk(),
    organizationId: tenantId(),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    businessId: text("business_id"),
    displayPhoneNumber: text("display_phone_number"),
    verifiedName: text("verified_name"),
    tokenEncrypted: text("token_encrypted").notNull(),
    pinEncrypted: text("pin_encrypted"),
    status: text("status").notNull(),
    // { "<template name>": "APPROVED" | "PENDING" | "REJECTED" | … }
    templates: jsonb("templates").default({}).notNull(),
    lastError: text("last_error"),
    connectedAt: timestamp("connected_at"),
    ...audit(),
  },
  (t) => [
    tenantKey("whatsapp_connections", t),
    // One connection per company; a number belongs to one company.
    uniqueIndex("whatsapp_connections_org_uq").on(t.organizationId),
    uniqueIndex("whatsapp_connections_phone_uq").on(t.phoneNumberId),
    check("whatsapp_connections_status_check", inList(t.status, WHATSAPP_CONNECTION_STATUSES)),
  ],
);

/* ---------------- System ---------------- */

/** Append-only: the app may add and read rows, never change or delete them. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: pk(),
    organizationId: tenantId(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    changes: jsonb("changes"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.organizationId, t.createdAt),
    index("audit_logs_entity_idx").on(t.organizationId, t.entityType, t.entityId),
  ],
);

/** Uploaded or generated files (logos, attachments, PDFs). Storage backend decided later. */
export const billingFiles = pgTable(
  "billing_files",
  {
    id: pk(),
    organizationId: tenantId(),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    check("billing_files_size_check", sql`${t.sizeBytes} >= 0`),
    index("billing_files_entity_idx").on(t.organizationId, t.entityType, t.entityId),
  ],
);

/** Every Business Billing table, for row-level security and the guard tests. */
export const BUSINESS_BILLING_TABLES = [
  "billing_settings",
  "company_branches",
  "invoice_sequences",
  "accounts",
  "units",
  "product_categories",
  "products",
  "services",
  "price_lists",
  "price_list_items",
  "customers",
  "customer_addresses",
  "suppliers",
  "quotations",
  "sales_orders",
  "business_invoices",
  "credit_notes",
  "debit_notes",
  "quotation_items",
  "sales_order_items",
  "business_invoice_items",
  "credit_note_items",
  "debit_note_items",
  "purchase_orders",
  "purchase_bills",
  "purchase_order_items",
  "purchase_bill_items",
  "purchase_returns",
  "purchase_return_items",
  "business_payments",
  "payment_allocations",
  "refunds",
  "warehouses",
  "stock_movements",
  "stock_adjustments",
  "stock_adjustment_items",
  "recurring_invoices",
  "recurring_invoice_runs",
  "document_shares",
  "billing_messages",
  "whatsapp_connections",
  "journal_entries",
  "journal_lines",
  "audit_logs",
  "billing_files",
] as const;
