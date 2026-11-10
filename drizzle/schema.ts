import { pgTable, text, timestamp, integer, boolean, date, bigint, jsonb, numeric, index, uniqueIndex, foreignKey, primaryKey, unique, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const account = pgTable("account", {
	id: text().primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").notNull(),
}, (table) => [
	index("account_userId_idx").using("btree", table.userId.asc().nullsLast()),
]);

export const accounts = pgTable("accounts", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	code: text().notNull(),
	name: text().notNull(),
	type: text().notNull(),
	parentId: text("parent_id"),
	isSystem: boolean("is_system").default(false).notNull(),
	archivedAt: timestamp("archived_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.parentId],
		foreignColumns: [table.organizationId, table.id],
		name: "accounts_parent_fk"
	}),
	index("accounts_parent_idx").using("btree", table.organizationId.asc().nullsLast(), table.parentId.asc().nullsLast()),
	unique("accounts_code_uq").on(table.organizationId, table.code),	unique("accounts_org_id_uq").on(table.organizationId, table.id),check("accounts_type_check", sql`(type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'income'::text, 'expense'::text]))`),]);

export const auditLogs = pgTable("audit_logs", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" } ),
	action: text().notNull(),
	entityType: text("entity_type").notNull(),
	entityId: text("entity_id"),
	changes: jsonb(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
}, (table) => [
	index("audit_logs_created_idx").using("btree", table.organizationId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
	index("audit_logs_entity_idx").using("btree", table.organizationId.asc().nullsLast(), table.entityType.asc().nullsLast(), table.entityId.asc().nullsLast()),
]);

export const billingFiles = pgTable("billing_files", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	storageKey: text("storage_key").notNull(),
	fileName: text("file_name").notNull(),
	contentType: text("content_type").notNull(),
	sizeBytes: bigint("size_bytes", { mode: 'number' }).notNull(),
	sha256: text(),
	entityType: text("entity_type"),
	entityId: text("entity_id"),
	uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
}, (table) => [
	index("billing_files_entity_idx").using("btree", table.organizationId.asc().nullsLast(), table.entityType.asc().nullsLast(), table.entityId.asc().nullsLast()),
	unique("billing_files_storage_key_key").on(table.storageKey),check("billing_files_size_check", sql`(size_bytes >= 0)`),]);

export const billingSettings = pgTable("billing_settings", {
	organizationId: text("organization_id").primaryKey().references(() => organization.id, { onDelete: "cascade" } ),
	legalName: text("legal_name").notNull(),
	tradeName: text("trade_name"),
	gstin: text(),
	pan: text(),
	email: text(),
	phone: text(),
	addressLine1: text("address_line1"),
	addressLine2: text("address_line2"),
	city: text(),
	state: text(),
	postalCode: text("postal_code"),
	countryCode: text("country_code").default("IN").notNull(),
	currency: text().default("INR").notNull(),
	financialYearStartMonth: integer("financial_year_start_month").default(4).notNull(),
	invoicePrefix: text("invoice_prefix").default("INV-").notNull(),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
check("billing_settings_fy_month_check", sql`((financial_year_start_month >= 1) AND (financial_year_start_month <= 12))`),]);

export const businessInvoiceItems = pgTable("business_invoice_items", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	lineNo: integer("line_no").notNull(),
	productId: text("product_id"),
	serviceId: text("service_id"),
	description: text().notNull(),
	hsnSac: text("hsn_sac"),
	quantity: numeric({ mode: 'number', precision: 15, scale: 3 }).default(1).notNull(),
	unitCode: text("unit_code"),
	ratePaise: bigint("rate_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxRate: numeric("tax_rate", { mode: 'number', precision: 7, scale: 4 }).default(0).notNull(),
	taxablePaise: bigint("taxable_paise", { mode: 'number' }).default(0).notNull(),
	cgstPaise: bigint("cgst_paise", { mode: 'number' }).default(0).notNull(),
	sgstPaise: bigint("sgst_paise", { mode: 'number' }).default(0).notNull(),
	igstPaise: bigint("igst_paise", { mode: 'number' }).default(0).notNull(),
	cessPaise: bigint("cess_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	invoiceId: text("invoice_id").notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.invoiceId],
		foreignColumns: [businessInvoices.organizationId, businessInvoices.id],
		name: "business_invoice_items_parent_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.organizationId, table.productId],
		foreignColumns: [products.organizationId, products.id],
		name: "business_invoice_items_product_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.serviceId],
		foreignColumns: [services.organizationId, services.id],
		name: "business_invoice_items_service_fk"
	}),
	index("business_invoice_items_parent_idx").using("btree", table.organizationId.asc().nullsLast(), table.invoiceId.asc().nullsLast()),
	index("business_invoice_items_product_idx").using("btree", table.organizationId.asc().nullsLast(), table.productId.asc().nullsLast()),
	unique("business_invoice_items_line_uq").on(table.organizationId, table.invoiceId, table.lineNo),check("business_invoice_items_amounts_check", sql`((rate_paise >= 0) AND (discount_paise >= 0) AND (total_paise >= 0))`),check("business_invoice_items_line_no_check", sql`(line_no >= 1)`),check("business_invoice_items_one_item_check", sql`(num_nonnulls(product_id, service_id) <= 1)`),check("business_invoice_items_quantity_check", sql`(quantity >= (0)::numeric)`),check("business_invoice_items_tax_rate_check", sql`((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric))`),]);

export const businessInvoices = pgTable("business_invoices", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	branchId: text("branch_id"),
	number: text(),
	issueDate: date("issue_date").notNull(),
	status: text().notNull(),
	placeOfSupply: text("place_of_supply"),
	currency: text().default("INR").notNull(),
	subtotalPaise: bigint("subtotal_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxPaise: bigint("tax_paise", { mode: 'number' }).default(0).notNull(),
	roundOffPaise: bigint("round_off_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	notes: text(),
	terms: text(),
	voidedAt: timestamp("voided_at"),
	voidReason: text("void_reason"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	customerId: text("customer_id").notNull(),
	partyName: text("party_name"),
	partyGstin: text("party_gstin"),
	billingAddress: jsonb("billing_address"),
	shippingAddress: jsonb("shipping_address"),
	dueDate: date("due_date"),
	quotationId: text("quotation_id"),
	salesOrderId: text("sales_order_id"),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.branchId],
		foreignColumns: [companyBranches.organizationId, companyBranches.id],
		name: "business_invoices_branch_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.customerId],
		foreignColumns: [customers.organizationId, customers.id],
		name: "business_invoices_party_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.quotationId],
		foreignColumns: [quotations.organizationId, quotations.id],
		name: "business_invoices_quotation_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.salesOrderId],
		foreignColumns: [salesOrders.organizationId, salesOrders.id],
		name: "business_invoices_sales_order_fk"
	}),
	index("business_invoices_date_idx").using("btree", table.organizationId.asc().nullsLast(), table.issueDate.asc().nullsLast()),
	index("business_invoices_due_idx").using("btree", table.organizationId.asc().nullsLast(), table.dueDate.asc().nullsLast()),
	uniqueIndex("business_invoices_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`(number IS NOT NULL)`),
	index("business_invoices_party_idx").using("btree", table.organizationId.asc().nullsLast(), table.customerId.asc().nullsLast()),
	index("business_invoices_status_idx").using("btree", table.organizationId.asc().nullsLast(), table.status.asc().nullsLast()),
	unique("business_invoices_org_id_uq").on(table.organizationId, table.id),check("business_invoices_amounts_check", sql`((subtotal_paise >= 0) AND (discount_paise >= 0) AND (tax_paise >= 0) AND (total_paise >= 0))`),check("business_invoices_due_check", sql`((due_date IS NULL) OR (due_date >= issue_date))`),check("business_invoices_status_check", sql`(status = ANY (ARRAY['draft'::text, 'issued'::text, 'partially_paid'::text, 'paid'::text, 'void'::text]))`),]);

export const businessPayments = pgTable("business_payments", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	direction: text().notNull(),
	customerId: text("customer_id"),
	supplierId: text("supplier_id"),
	accountId: text("account_id"),
	number: text(),
	paymentDate: date("payment_date").notNull(),
	amountPaise: bigint("amount_paise", { mode: 'number' }).notNull(),
	method: text().notNull(),
	reference: text(),
	notes: text(),
	status: text().default("recorded").notNull(),
	voidedAt: timestamp("voided_at"),
	voidReason: text("void_reason"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.accountId],
		foreignColumns: [accounts.organizationId, accounts.id],
		name: "business_payments_account_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.customerId],
		foreignColumns: [customers.organizationId, customers.id],
		name: "business_payments_customer_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.supplierId],
		foreignColumns: [suppliers.organizationId, suppliers.id],
		name: "business_payments_supplier_fk"
	}),
	index("business_payments_customer_idx").using("btree", table.organizationId.asc().nullsLast(), table.customerId.asc().nullsLast()),
	index("business_payments_date_idx").using("btree", table.organizationId.asc().nullsLast(), table.paymentDate.asc().nullsLast()),
	uniqueIndex("business_payments_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`(number IS NOT NULL)`),
	index("business_payments_supplier_idx").using("btree", table.organizationId.asc().nullsLast(), table.supplierId.asc().nullsLast()),
	unique("business_payments_org_id_uq").on(table.organizationId, table.id),check("business_payments_amount_check", sql`(amount_paise > 0)`),check("business_payments_method_check", sql`(method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'upi'::text, 'card'::text, 'cheque'::text, 'other'::text]))`),check("business_payments_party_check", sql`(((direction = 'received'::text) AND (customer_id IS NOT NULL) AND (supplier_id IS NULL)) OR ((direction = 'made'::text) AND (supplier_id IS NOT NULL) AND (customer_id IS NULL)))`),check("business_payments_status_check", sql`(status = ANY (ARRAY['recorded'::text, 'void'::text]))`),]);

export const companyBranches = pgTable("company_branches", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	name: text().notNull(),
	code: text().notNull(),
	gstin: text(),
	addressLine1: text("address_line1"),
	addressLine2: text("address_line2"),
	city: text(),
	state: text(),
	stateCode: text("state_code"),
	postalCode: text("postal_code"),
	countryCode: text("country_code").default("IN").notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	archivedAt: timestamp("archived_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	uniqueIndex("company_branches_one_default_uq").using("btree", table.organizationId.asc().nullsLast()).where(sql`is_default`),
	unique("company_branches_code_uq").on(table.organizationId, table.code),	unique("company_branches_org_id_uq").on(table.organizationId, table.id),]);

export const creditNoteItems = pgTable("credit_note_items", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	lineNo: integer("line_no").notNull(),
	productId: text("product_id"),
	serviceId: text("service_id"),
	description: text().notNull(),
	hsnSac: text("hsn_sac"),
	quantity: numeric({ mode: 'number', precision: 15, scale: 3 }).default(1).notNull(),
	unitCode: text("unit_code"),
	ratePaise: bigint("rate_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxRate: numeric("tax_rate", { mode: 'number', precision: 7, scale: 4 }).default(0).notNull(),
	taxablePaise: bigint("taxable_paise", { mode: 'number' }).default(0).notNull(),
	cgstPaise: bigint("cgst_paise", { mode: 'number' }).default(0).notNull(),
	sgstPaise: bigint("sgst_paise", { mode: 'number' }).default(0).notNull(),
	igstPaise: bigint("igst_paise", { mode: 'number' }).default(0).notNull(),
	cessPaise: bigint("cess_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	creditNoteId: text("credit_note_id").notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.creditNoteId],
		foreignColumns: [creditNotes.organizationId, creditNotes.id],
		name: "credit_note_items_parent_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.organizationId, table.productId],
		foreignColumns: [products.organizationId, products.id],
		name: "credit_note_items_product_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.serviceId],
		foreignColumns: [services.organizationId, services.id],
		name: "credit_note_items_service_fk"
	}),
	index("credit_note_items_parent_idx").using("btree", table.organizationId.asc().nullsLast(), table.creditNoteId.asc().nullsLast()),
	index("credit_note_items_product_idx").using("btree", table.organizationId.asc().nullsLast(), table.productId.asc().nullsLast()),
	unique("credit_note_items_line_uq").on(table.organizationId, table.creditNoteId, table.lineNo),check("credit_note_items_amounts_check", sql`((rate_paise >= 0) AND (discount_paise >= 0) AND (total_paise >= 0))`),check("credit_note_items_line_no_check", sql`(line_no >= 1)`),check("credit_note_items_one_item_check", sql`(num_nonnulls(product_id, service_id) <= 1)`),check("credit_note_items_quantity_check", sql`(quantity >= (0)::numeric)`),check("credit_note_items_tax_rate_check", sql`((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric))`),]);

export const creditNotes = pgTable("credit_notes", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	branchId: text("branch_id"),
	number: text(),
	issueDate: date("issue_date").notNull(),
	status: text().notNull(),
	placeOfSupply: text("place_of_supply"),
	currency: text().default("INR").notNull(),
	subtotalPaise: bigint("subtotal_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxPaise: bigint("tax_paise", { mode: 'number' }).default(0).notNull(),
	roundOffPaise: bigint("round_off_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	notes: text(),
	terms: text(),
	voidedAt: timestamp("voided_at"),
	voidReason: text("void_reason"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	customerId: text("customer_id").notNull(),
	partyName: text("party_name"),
	partyGstin: text("party_gstin"),
	billingAddress: jsonb("billing_address"),
	shippingAddress: jsonb("shipping_address"),
	invoiceId: text("invoice_id"),
	reason: text(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.branchId],
		foreignColumns: [companyBranches.organizationId, companyBranches.id],
		name: "credit_notes_branch_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.invoiceId],
		foreignColumns: [businessInvoices.organizationId, businessInvoices.id],
		name: "credit_notes_invoice_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.customerId],
		foreignColumns: [customers.organizationId, customers.id],
		name: "credit_notes_party_fk"
	}),
	index("credit_notes_date_idx").using("btree", table.organizationId.asc().nullsLast(), table.issueDate.asc().nullsLast()),
	index("credit_notes_invoice_idx").using("btree", table.organizationId.asc().nullsLast(), table.invoiceId.asc().nullsLast()),
	uniqueIndex("credit_notes_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`(number IS NOT NULL)`),
	index("credit_notes_party_idx").using("btree", table.organizationId.asc().nullsLast(), table.customerId.asc().nullsLast()),
	index("credit_notes_status_idx").using("btree", table.organizationId.asc().nullsLast(), table.status.asc().nullsLast()),
	unique("credit_notes_org_id_uq").on(table.organizationId, table.id),check("credit_notes_amounts_check", sql`((subtotal_paise >= 0) AND (discount_paise >= 0) AND (tax_paise >= 0) AND (total_paise >= 0))`),check("credit_notes_status_check", sql`(status = ANY (ARRAY['draft'::text, 'issued'::text, 'void'::text]))`),]);

export const customerAddresses = pgTable("customer_addresses", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	customerId: text("customer_id").notNull(),
	type: text().notNull(),
	label: text(),
	addressLine1: text("address_line1"),
	addressLine2: text("address_line2"),
	city: text(),
	state: text(),
	stateCode: text("state_code"),
	postalCode: text("postal_code"),
	countryCode: text("country_code").default("IN").notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.customerId],
		foreignColumns: [customers.organizationId, customers.id],
		name: "customer_addresses_customer_fk"
	}).onDelete("cascade"),
	index("customer_addresses_customer_idx").using("btree", table.organizationId.asc().nullsLast(), table.customerId.asc().nullsLast()),
	uniqueIndex("customer_addresses_one_default_uq").using("btree", table.organizationId.asc().nullsLast(), table.customerId.asc().nullsLast(), table.type.asc().nullsLast()).where(sql`is_default`),
check("customer_addresses_type_check", sql`(type = ANY (ARRAY['billing'::text, 'shipping'::text]))`),]);

export const customers = pgTable("customers", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	code: text(),
	name: text().notNull(),
	displayName: text("display_name"),
	gstin: text(),
	pan: text(),
	email: text(),
	phone: text(),
	placeOfSupply: text("place_of_supply"),
	paymentTermsDays: integer("payment_terms_days"),
	creditLimitPaise: bigint("credit_limit_paise", { mode: 'number' }),
	openingBalancePaise: bigint("opening_balance_paise", { mode: 'number' }).default(0).notNull(),
	priceListId: text("price_list_id"),
	notes: text(),
	archivedAt: timestamp("archived_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	customerType: text("customer_type").default("business").notNull(),
	contactPerson: text("contact_person"),
	category: text(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.priceListId],
		foreignColumns: [priceLists.organizationId, priceLists.id],
		name: "customers_price_list_fk"
	}),
	uniqueIndex("customers_active_gstin_uq").using("btree", table.organizationId.asc().nullsLast(), table.gstin.asc().nullsLast()).where(sql`((gstin IS NOT NULL) AND (archived_at IS NULL))`),
	uniqueIndex("customers_code_uq").using("btree", table.organizationId.asc().nullsLast(), table.code.asc().nullsLast()).where(sql`(code IS NOT NULL)`),
	index("customers_gstin_idx").using("btree", table.organizationId.asc().nullsLast(), table.gstin.asc().nullsLast()),
	index("customers_name_idx").using("btree", table.organizationId.asc().nullsLast(), table.name.asc().nullsLast()),
	unique("customers_org_id_uq").on(table.organizationId, table.id),check("customers_credit_check", sql`((credit_limit_paise IS NULL) OR (credit_limit_paise >= 0))`),check("customers_terms_check", sql`((payment_terms_days IS NULL) OR (payment_terms_days >= 0))`),check("customers_type_check", sql`(customer_type = ANY (ARRAY['individual'::text, 'business'::text]))`),]);

export const debitNoteItems = pgTable("debit_note_items", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	lineNo: integer("line_no").notNull(),
	productId: text("product_id"),
	serviceId: text("service_id"),
	description: text().notNull(),
	hsnSac: text("hsn_sac"),
	quantity: numeric({ mode: 'number', precision: 15, scale: 3 }).default(1).notNull(),
	unitCode: text("unit_code"),
	ratePaise: bigint("rate_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxRate: numeric("tax_rate", { mode: 'number', precision: 7, scale: 4 }).default(0).notNull(),
	taxablePaise: bigint("taxable_paise", { mode: 'number' }).default(0).notNull(),
	cgstPaise: bigint("cgst_paise", { mode: 'number' }).default(0).notNull(),
	sgstPaise: bigint("sgst_paise", { mode: 'number' }).default(0).notNull(),
	igstPaise: bigint("igst_paise", { mode: 'number' }).default(0).notNull(),
	cessPaise: bigint("cess_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	debitNoteId: text("debit_note_id").notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.debitNoteId],
		foreignColumns: [debitNotes.organizationId, debitNotes.id],
		name: "debit_note_items_parent_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.organizationId, table.productId],
		foreignColumns: [products.organizationId, products.id],
		name: "debit_note_items_product_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.serviceId],
		foreignColumns: [services.organizationId, services.id],
		name: "debit_note_items_service_fk"
	}),
	index("debit_note_items_parent_idx").using("btree", table.organizationId.asc().nullsLast(), table.debitNoteId.asc().nullsLast()),
	index("debit_note_items_product_idx").using("btree", table.organizationId.asc().nullsLast(), table.productId.asc().nullsLast()),
	unique("debit_note_items_line_uq").on(table.organizationId, table.debitNoteId, table.lineNo),check("debit_note_items_amounts_check", sql`((rate_paise >= 0) AND (discount_paise >= 0) AND (total_paise >= 0))`),check("debit_note_items_line_no_check", sql`(line_no >= 1)`),check("debit_note_items_one_item_check", sql`(num_nonnulls(product_id, service_id) <= 1)`),check("debit_note_items_quantity_check", sql`(quantity >= (0)::numeric)`),check("debit_note_items_tax_rate_check", sql`((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric))`),]);

export const debitNotes = pgTable("debit_notes", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	branchId: text("branch_id"),
	number: text(),
	issueDate: date("issue_date").notNull(),
	status: text().notNull(),
	placeOfSupply: text("place_of_supply"),
	currency: text().default("INR").notNull(),
	subtotalPaise: bigint("subtotal_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxPaise: bigint("tax_paise", { mode: 'number' }).default(0).notNull(),
	roundOffPaise: bigint("round_off_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	notes: text(),
	terms: text(),
	voidedAt: timestamp("voided_at"),
	voidReason: text("void_reason"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	customerId: text("customer_id").notNull(),
	partyName: text("party_name"),
	partyGstin: text("party_gstin"),
	billingAddress: jsonb("billing_address"),
	shippingAddress: jsonb("shipping_address"),
	invoiceId: text("invoice_id"),
	reason: text(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.branchId],
		foreignColumns: [companyBranches.organizationId, companyBranches.id],
		name: "debit_notes_branch_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.invoiceId],
		foreignColumns: [businessInvoices.organizationId, businessInvoices.id],
		name: "debit_notes_invoice_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.customerId],
		foreignColumns: [customers.organizationId, customers.id],
		name: "debit_notes_party_fk"
	}),
	index("debit_notes_date_idx").using("btree", table.organizationId.asc().nullsLast(), table.issueDate.asc().nullsLast()),
	index("debit_notes_invoice_idx").using("btree", table.organizationId.asc().nullsLast(), table.invoiceId.asc().nullsLast()),
	uniqueIndex("debit_notes_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`(number IS NOT NULL)`),
	index("debit_notes_party_idx").using("btree", table.organizationId.asc().nullsLast(), table.customerId.asc().nullsLast()),
	index("debit_notes_status_idx").using("btree", table.organizationId.asc().nullsLast(), table.status.asc().nullsLast()),
	unique("debit_notes_org_id_uq").on(table.organizationId, table.id),check("debit_notes_amounts_check", sql`((subtotal_paise >= 0) AND (discount_paise >= 0) AND (tax_paise >= 0) AND (total_paise >= 0))`),check("debit_notes_status_check", sql`(status = ANY (ARRAY['draft'::text, 'issued'::text, 'void'::text]))`),]);

export const invitation = pgTable("invitation", {
	id: text().primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" } ),
	email: text().notNull(),
	role: text(),
	status: text().default("pending").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
}, (table) => [
	index("invitation_email_idx").using("btree", table.email.asc().nullsLast()),
	index("invitation_organizationId_idx").using("btree", table.organizationId.asc().nullsLast()),
]);

export const invoiceSequences = pgTable("invoice_sequences", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	branchId: text("branch_id"),
	documentType: text("document_type").notNull(),
	financialYear: text("financial_year").notNull(),
	prefix: text().default("").notNull(),
	nextNumber: bigint("next_number", { mode: 'number' }).default(1).notNull(),
	padding: integer().default(4).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.branchId],
		foreignColumns: [companyBranches.organizationId, companyBranches.id],
		name: "invoice_sequences_branch_fk"
	}),
	unique("invoice_sequences_org_id_uq").on(table.organizationId, table.id),	unique("invoice_sequences_series_uq").on(table.organizationId, table.branchId, table.documentType, table.financialYear).nullsNotDistinct(),check("invoice_sequences_next_check", sql`(next_number >= 1)`),check("invoice_sequences_padding_check", sql`((padding >= 1) AND (padding <= 12))`),check("invoice_sequences_type_check", sql`(document_type = ANY (ARRAY['invoice'::text, 'quotation'::text, 'sales_order'::text, 'credit_note'::text, 'debit_note'::text, 'payment'::text, 'refund'::text, 'purchase_order'::text, 'purchase_bill'::text, 'journal_entry'::text]))`),]);

export const journalEntries = pgTable("journal_entries", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	number: text(),
	entryDate: date("entry_date").notNull(),
	narration: text(),
	sourceType: text("source_type").notNull(),
	sourceId: text("source_id"),
	postedAt: timestamp("posted_at"),
	reversesEntryId: text("reverses_entry_id"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.reversesEntryId],
		foreignColumns: [table.organizationId, table.id],
		name: "journal_entries_reverses_fk"
	}),
	index("journal_entries_date_idx").using("btree", table.organizationId.asc().nullsLast(), table.entryDate.asc().nullsLast()),
	uniqueIndex("journal_entries_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`(number IS NOT NULL)`),
	uniqueIndex("journal_entries_one_reversal_uq").using("btree", table.organizationId.asc().nullsLast(), table.reversesEntryId.asc().nullsLast()).where(sql`(reverses_entry_id IS NOT NULL)`),
	index("journal_entries_source_idx").using("btree", table.organizationId.asc().nullsLast(), table.sourceType.asc().nullsLast(), table.sourceId.asc().nullsLast()),
	unique("journal_entries_org_id_uq").on(table.organizationId, table.id),]);

export const journalLines = pgTable("journal_lines", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	entryId: text("entry_id").notNull(),
	lineNo: integer("line_no").notNull(),
	accountId: text("account_id").notNull(),
	customerId: text("customer_id"),
	supplierId: text("supplier_id"),
	debitPaise: bigint("debit_paise", { mode: 'number' }).default(0).notNull(),
	creditPaise: bigint("credit_paise", { mode: 'number' }).default(0).notNull(),
	description: text(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.accountId],
		foreignColumns: [accounts.organizationId, accounts.id],
		name: "journal_lines_account_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.customerId],
		foreignColumns: [customers.organizationId, customers.id],
		name: "journal_lines_customer_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.entryId],
		foreignColumns: [journalEntries.organizationId, journalEntries.id],
		name: "journal_lines_entry_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.organizationId, table.supplierId],
		foreignColumns: [suppliers.organizationId, suppliers.id],
		name: "journal_lines_supplier_fk"
	}),
	index("journal_lines_account_idx").using("btree", table.organizationId.asc().nullsLast(), table.accountId.asc().nullsLast()),
	index("journal_lines_customer_idx").using("btree", table.organizationId.asc().nullsLast(), table.customerId.asc().nullsLast()),
	index("journal_lines_entry_idx").using("btree", table.organizationId.asc().nullsLast(), table.entryId.asc().nullsLast()),
	index("journal_lines_supplier_idx").using("btree", table.organizationId.asc().nullsLast(), table.supplierId.asc().nullsLast()),
	unique("journal_lines_line_uq").on(table.organizationId, table.entryId, table.lineNo),check("journal_lines_one_party_check", sql`(num_nonnulls(customer_id, supplier_id) <= 1)`),check("journal_lines_side_check", sql`(((debit_paise > 0) AND (credit_paise = 0)) OR ((credit_paise > 0) AND (debit_paise = 0)))`),]);

export const member = pgTable("member", {
	id: text().primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" } ),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	role: text().default("member").notNull(),
	createdAt: timestamp("created_at").notNull(),
}, (table) => [
	index("member_organizationId_idx").using("btree", table.organizationId.asc().nullsLast()),
	uniqueIndex("member_userId_uidx").using("btree", table.userId.asc().nullsLast()),
]);

export const organization = pgTable("organization", {
	id: text().primaryKey(),
	name: text().notNull(),
	slug: text().notNull(),
	logo: text(),
	createdAt: timestamp("created_at").notNull(),
	metadata: text(),
	seatLimit: integer("seat_limit").default(5).notNull(),
	planStatus: text("plan_status").default("trialing").notNull(),
	subscriptionId: text("subscription_id"),
	trialEndsAt: timestamp("trial_ends_at"),
	planId: text("plan_id").default("starter").notNull(),
	billingCycle: text("billing_cycle").default("monthly").notNull(),
	currentPeriodEnd: timestamp("current_period_end"),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
}, (table) => [
	uniqueIndex("organization_slug_uidx").using("btree", table.slug.asc().nullsLast()),
	unique("organization_slug_key").on(table.slug),]);

export const paymentAllocations = pgTable("payment_allocations", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	paymentId: text("payment_id").notNull(),
	invoiceId: text("invoice_id"),
	purchaseBillId: text("purchase_bill_id"),
	amountPaise: bigint("amount_paise", { mode: 'number' }).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.purchaseBillId],
		foreignColumns: [purchaseBills.organizationId, purchaseBills.id],
		name: "payment_allocations_bill_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.invoiceId],
		foreignColumns: [businessInvoices.organizationId, businessInvoices.id],
		name: "payment_allocations_invoice_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.paymentId],
		foreignColumns: [businessPayments.organizationId, businessPayments.id],
		name: "payment_allocations_payment_fk"
	}).onDelete("cascade"),
	index("payment_allocations_bill_idx").using("btree", table.organizationId.asc().nullsLast(), table.purchaseBillId.asc().nullsLast()),
	uniqueIndex("payment_allocations_bill_uq").using("btree", table.organizationId.asc().nullsLast(), table.paymentId.asc().nullsLast(), table.purchaseBillId.asc().nullsLast()).where(sql`(purchase_bill_id IS NOT NULL)`),
	index("payment_allocations_invoice_idx").using("btree", table.organizationId.asc().nullsLast(), table.invoiceId.asc().nullsLast()),
	uniqueIndex("payment_allocations_invoice_uq").using("btree", table.organizationId.asc().nullsLast(), table.paymentId.asc().nullsLast(), table.invoiceId.asc().nullsLast()).where(sql`(invoice_id IS NOT NULL)`),
check("payment_allocations_amount_check", sql`(amount_paise > 0)`),check("payment_allocations_one_target_check", sql`(num_nonnulls(invoice_id, purchase_bill_id) = 1)`),]);

export const priceListItems = pgTable("price_list_items", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	priceListId: text("price_list_id").notNull(),
	productId: text("product_id"),
	serviceId: text("service_id"),
	pricePaise: bigint("price_paise", { mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.priceListId],
		foreignColumns: [priceLists.organizationId, priceLists.id],
		name: "price_list_items_list_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.organizationId, table.productId],
		foreignColumns: [products.organizationId, products.id],
		name: "price_list_items_product_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.serviceId],
		foreignColumns: [services.organizationId, services.id],
		name: "price_list_items_service_fk"
	}),
	uniqueIndex("price_list_items_product_uq").using("btree", table.organizationId.asc().nullsLast(), table.priceListId.asc().nullsLast(), table.productId.asc().nullsLast()).where(sql`(product_id IS NOT NULL)`),
	uniqueIndex("price_list_items_service_uq").using("btree", table.organizationId.asc().nullsLast(), table.priceListId.asc().nullsLast(), table.serviceId.asc().nullsLast()).where(sql`(service_id IS NOT NULL)`),
check("price_list_items_one_item_check", sql`(num_nonnulls(product_id, service_id) = 1)`),check("price_list_items_price_check", sql`(price_paise >= 0)`),]);

export const priceLists = pgTable("price_lists", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	name: text().notNull(),
	currency: text().default("INR").notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	archivedAt: timestamp("archived_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	uniqueIndex("price_lists_one_default_uq").using("btree", table.organizationId.asc().nullsLast()).where(sql`is_default`),
	unique("price_lists_name_uq").on(table.organizationId, table.name),	unique("price_lists_org_id_uq").on(table.organizationId, table.id),]);

export const productCategories = pgTable("product_categories", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	parentId: text("parent_id"),
	name: text().notNull(),
	archivedAt: timestamp("archived_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.parentId],
		foreignColumns: [table.organizationId, table.id],
		name: "product_categories_parent_fk"
	}),
	unique("product_categories_name_uq").on(table.organizationId, table.parentId, table.name).nullsNotDistinct(),	unique("product_categories_org_id_uq").on(table.organizationId, table.id),]);

export const products = pgTable("products", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	sku: text(),
	name: text().notNull(),
	description: text(),
	categoryId: text("category_id"),
	unitId: text("unit_id").notNull(),
	hsnCode: text("hsn_code"),
	taxRate: numeric("tax_rate", { mode: 'number', precision: 7, scale: 4 }).default(0).notNull(),
	salePricePaise: bigint("sale_price_paise", { mode: 'number' }).default(0).notNull(),
	purchasePricePaise: bigint("purchase_price_paise", { mode: 'number' }).default(0).notNull(),
	trackInventory: boolean("track_inventory").default(false).notNull(),
	archivedAt: timestamp("archived_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	barcode: text(),
	brand: text(),
	minStockQty: numeric("min_stock_qty", { precision: 15, scale: 3 }),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.categoryId],
		foreignColumns: [productCategories.organizationId, productCategories.id],
		name: "products_category_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.unitId],
		foreignColumns: [units.organizationId, units.id],
		name: "products_unit_fk"
	}),
	uniqueIndex("products_barcode_uq").using("btree", table.organizationId.asc().nullsLast(), table.barcode.asc().nullsLast()).where(sql`(barcode IS NOT NULL)`),
	index("products_category_idx").using("btree", table.organizationId.asc().nullsLast(), table.categoryId.asc().nullsLast()),
	index("products_name_idx").using("btree", table.organizationId.asc().nullsLast(), table.name.asc().nullsLast()),
	uniqueIndex("products_sku_uq").using("btree", table.organizationId.asc().nullsLast(), table.sku.asc().nullsLast()).where(sql`(sku IS NOT NULL)`),
	unique("products_org_id_uq").on(table.organizationId, table.id),check("products_min_stock_check", sql`((min_stock_qty IS NULL) OR (min_stock_qty >= (0)::numeric))`),check("products_prices_check", sql`((sale_price_paise >= 0) AND (purchase_price_paise >= 0))`),check("products_tax_rate_check", sql`((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric))`),]);

export const purchaseBillItems = pgTable("purchase_bill_items", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	lineNo: integer("line_no").notNull(),
	productId: text("product_id"),
	serviceId: text("service_id"),
	description: text().notNull(),
	hsnSac: text("hsn_sac"),
	quantity: numeric({ mode: 'number', precision: 15, scale: 3 }).default(1).notNull(),
	unitCode: text("unit_code"),
	ratePaise: bigint("rate_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxRate: numeric("tax_rate", { mode: 'number', precision: 7, scale: 4 }).default(0).notNull(),
	taxablePaise: bigint("taxable_paise", { mode: 'number' }).default(0).notNull(),
	cgstPaise: bigint("cgst_paise", { mode: 'number' }).default(0).notNull(),
	sgstPaise: bigint("sgst_paise", { mode: 'number' }).default(0).notNull(),
	igstPaise: bigint("igst_paise", { mode: 'number' }).default(0).notNull(),
	cessPaise: bigint("cess_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	purchaseBillId: text("purchase_bill_id").notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.purchaseBillId],
		foreignColumns: [purchaseBills.organizationId, purchaseBills.id],
		name: "purchase_bill_items_parent_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.organizationId, table.productId],
		foreignColumns: [products.organizationId, products.id],
		name: "purchase_bill_items_product_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.serviceId],
		foreignColumns: [services.organizationId, services.id],
		name: "purchase_bill_items_service_fk"
	}),
	index("purchase_bill_items_parent_idx").using("btree", table.organizationId.asc().nullsLast(), table.purchaseBillId.asc().nullsLast()),
	index("purchase_bill_items_product_idx").using("btree", table.organizationId.asc().nullsLast(), table.productId.asc().nullsLast()),
	unique("purchase_bill_items_line_uq").on(table.organizationId, table.purchaseBillId, table.lineNo),check("purchase_bill_items_amounts_check", sql`((rate_paise >= 0) AND (discount_paise >= 0) AND (total_paise >= 0))`),check("purchase_bill_items_line_no_check", sql`(line_no >= 1)`),check("purchase_bill_items_one_item_check", sql`(num_nonnulls(product_id, service_id) <= 1)`),check("purchase_bill_items_quantity_check", sql`(quantity >= (0)::numeric)`),check("purchase_bill_items_tax_rate_check", sql`((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric))`),]);

export const purchaseBills = pgTable("purchase_bills", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	branchId: text("branch_id"),
	number: text(),
	issueDate: date("issue_date").notNull(),
	status: text().notNull(),
	placeOfSupply: text("place_of_supply"),
	currency: text().default("INR").notNull(),
	subtotalPaise: bigint("subtotal_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxPaise: bigint("tax_paise", { mode: 'number' }).default(0).notNull(),
	roundOffPaise: bigint("round_off_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	notes: text(),
	terms: text(),
	voidedAt: timestamp("voided_at"),
	voidReason: text("void_reason"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	supplierId: text("supplier_id").notNull(),
	supplierBillNumber: text("supplier_bill_number"),
	dueDate: date("due_date"),
	purchaseOrderId: text("purchase_order_id"),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.branchId],
		foreignColumns: [companyBranches.organizationId, companyBranches.id],
		name: "purchase_bills_branch_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.purchaseOrderId],
		foreignColumns: [purchaseOrders.organizationId, purchaseOrders.id],
		name: "purchase_bills_order_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.supplierId],
		foreignColumns: [suppliers.organizationId, suppliers.id],
		name: "purchase_bills_party_fk"
	}),
	index("purchase_bills_date_idx").using("btree", table.organizationId.asc().nullsLast(), table.issueDate.asc().nullsLast()),
	index("purchase_bills_due_idx").using("btree", table.organizationId.asc().nullsLast(), table.dueDate.asc().nullsLast()),
	uniqueIndex("purchase_bills_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`(number IS NOT NULL)`),
	index("purchase_bills_party_idx").using("btree", table.organizationId.asc().nullsLast(), table.supplierId.asc().nullsLast()),
	index("purchase_bills_status_idx").using("btree", table.organizationId.asc().nullsLast(), table.status.asc().nullsLast()),
	uniqueIndex("purchase_bills_supplier_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.supplierId.asc().nullsLast(), table.supplierBillNumber.asc().nullsLast()).where(sql`(supplier_bill_number IS NOT NULL)`),
	unique("purchase_bills_org_id_uq").on(table.organizationId, table.id),check("purchase_bills_amounts_check", sql`((subtotal_paise >= 0) AND (discount_paise >= 0) AND (tax_paise >= 0) AND (total_paise >= 0))`),check("purchase_bills_due_check", sql`((due_date IS NULL) OR (due_date >= issue_date))`),check("purchase_bills_status_check", sql`(status = ANY (ARRAY['draft'::text, 'recorded'::text, 'partially_paid'::text, 'paid'::text, 'void'::text]))`),]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	lineNo: integer("line_no").notNull(),
	productId: text("product_id"),
	serviceId: text("service_id"),
	description: text().notNull(),
	hsnSac: text("hsn_sac"),
	quantity: numeric({ mode: 'number', precision: 15, scale: 3 }).default(1).notNull(),
	unitCode: text("unit_code"),
	ratePaise: bigint("rate_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxRate: numeric("tax_rate", { mode: 'number', precision: 7, scale: 4 }).default(0).notNull(),
	taxablePaise: bigint("taxable_paise", { mode: 'number' }).default(0).notNull(),
	cgstPaise: bigint("cgst_paise", { mode: 'number' }).default(0).notNull(),
	sgstPaise: bigint("sgst_paise", { mode: 'number' }).default(0).notNull(),
	igstPaise: bigint("igst_paise", { mode: 'number' }).default(0).notNull(),
	cessPaise: bigint("cess_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	purchaseOrderId: text("purchase_order_id").notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.purchaseOrderId],
		foreignColumns: [purchaseOrders.organizationId, purchaseOrders.id],
		name: "purchase_order_items_parent_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.organizationId, table.productId],
		foreignColumns: [products.organizationId, products.id],
		name: "purchase_order_items_product_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.serviceId],
		foreignColumns: [services.organizationId, services.id],
		name: "purchase_order_items_service_fk"
	}),
	index("purchase_order_items_parent_idx").using("btree", table.organizationId.asc().nullsLast(), table.purchaseOrderId.asc().nullsLast()),
	index("purchase_order_items_product_idx").using("btree", table.organizationId.asc().nullsLast(), table.productId.asc().nullsLast()),
	unique("purchase_order_items_line_uq").on(table.organizationId, table.purchaseOrderId, table.lineNo),check("purchase_order_items_amounts_check", sql`((rate_paise >= 0) AND (discount_paise >= 0) AND (total_paise >= 0))`),check("purchase_order_items_line_no_check", sql`(line_no >= 1)`),check("purchase_order_items_one_item_check", sql`(num_nonnulls(product_id, service_id) <= 1)`),check("purchase_order_items_quantity_check", sql`(quantity >= (0)::numeric)`),check("purchase_order_items_tax_rate_check", sql`((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric))`),]);

export const purchaseOrders = pgTable("purchase_orders", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	branchId: text("branch_id"),
	number: text(),
	issueDate: date("issue_date").notNull(),
	status: text().notNull(),
	placeOfSupply: text("place_of_supply"),
	currency: text().default("INR").notNull(),
	subtotalPaise: bigint("subtotal_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxPaise: bigint("tax_paise", { mode: 'number' }).default(0).notNull(),
	roundOffPaise: bigint("round_off_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	notes: text(),
	terms: text(),
	voidedAt: timestamp("voided_at"),
	voidReason: text("void_reason"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	supplierId: text("supplier_id").notNull(),
	expectedDate: date("expected_date"),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.branchId],
		foreignColumns: [companyBranches.organizationId, companyBranches.id],
		name: "purchase_orders_branch_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.supplierId],
		foreignColumns: [suppliers.organizationId, suppliers.id],
		name: "purchase_orders_party_fk"
	}),
	index("purchase_orders_date_idx").using("btree", table.organizationId.asc().nullsLast(), table.issueDate.asc().nullsLast()),
	uniqueIndex("purchase_orders_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`(number IS NOT NULL)`),
	index("purchase_orders_party_idx").using("btree", table.organizationId.asc().nullsLast(), table.supplierId.asc().nullsLast()),
	index("purchase_orders_status_idx").using("btree", table.organizationId.asc().nullsLast(), table.status.asc().nullsLast()),
	unique("purchase_orders_org_id_uq").on(table.organizationId, table.id),check("purchase_orders_amounts_check", sql`((subtotal_paise >= 0) AND (discount_paise >= 0) AND (tax_paise >= 0) AND (total_paise >= 0))`),check("purchase_orders_status_check", sql`(status = ANY (ARRAY['draft'::text, 'sent'::text, 'received'::text, 'billed'::text, 'void'::text]))`),]);

export const quotationItems = pgTable("quotation_items", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	lineNo: integer("line_no").notNull(),
	productId: text("product_id"),
	serviceId: text("service_id"),
	description: text().notNull(),
	hsnSac: text("hsn_sac"),
	quantity: numeric({ mode: 'number', precision: 15, scale: 3 }).default(1).notNull(),
	unitCode: text("unit_code"),
	ratePaise: bigint("rate_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxRate: numeric("tax_rate", { mode: 'number', precision: 7, scale: 4 }).default(0).notNull(),
	taxablePaise: bigint("taxable_paise", { mode: 'number' }).default(0).notNull(),
	cgstPaise: bigint("cgst_paise", { mode: 'number' }).default(0).notNull(),
	sgstPaise: bigint("sgst_paise", { mode: 'number' }).default(0).notNull(),
	igstPaise: bigint("igst_paise", { mode: 'number' }).default(0).notNull(),
	cessPaise: bigint("cess_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	quotationId: text("quotation_id").notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.quotationId],
		foreignColumns: [quotations.organizationId, quotations.id],
		name: "quotation_items_parent_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.organizationId, table.productId],
		foreignColumns: [products.organizationId, products.id],
		name: "quotation_items_product_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.serviceId],
		foreignColumns: [services.organizationId, services.id],
		name: "quotation_items_service_fk"
	}),
	index("quotation_items_parent_idx").using("btree", table.organizationId.asc().nullsLast(), table.quotationId.asc().nullsLast()),
	index("quotation_items_product_idx").using("btree", table.organizationId.asc().nullsLast(), table.productId.asc().nullsLast()),
	unique("quotation_items_line_uq").on(table.organizationId, table.quotationId, table.lineNo),check("quotation_items_amounts_check", sql`((rate_paise >= 0) AND (discount_paise >= 0) AND (total_paise >= 0))`),check("quotation_items_line_no_check", sql`(line_no >= 1)`),check("quotation_items_one_item_check", sql`(num_nonnulls(product_id, service_id) <= 1)`),check("quotation_items_quantity_check", sql`(quantity >= (0)::numeric)`),check("quotation_items_tax_rate_check", sql`((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric))`),]);

export const quotations = pgTable("quotations", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	branchId: text("branch_id"),
	number: text(),
	issueDate: date("issue_date").notNull(),
	status: text().notNull(),
	placeOfSupply: text("place_of_supply"),
	currency: text().default("INR").notNull(),
	subtotalPaise: bigint("subtotal_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxPaise: bigint("tax_paise", { mode: 'number' }).default(0).notNull(),
	roundOffPaise: bigint("round_off_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	notes: text(),
	terms: text(),
	voidedAt: timestamp("voided_at"),
	voidReason: text("void_reason"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	customerId: text("customer_id").notNull(),
	partyName: text("party_name"),
	partyGstin: text("party_gstin"),
	billingAddress: jsonb("billing_address"),
	shippingAddress: jsonb("shipping_address"),
	validUntil: date("valid_until"),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.branchId],
		foreignColumns: [companyBranches.organizationId, companyBranches.id],
		name: "quotations_branch_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.customerId],
		foreignColumns: [customers.organizationId, customers.id],
		name: "quotations_party_fk"
	}),
	index("quotations_date_idx").using("btree", table.organizationId.asc().nullsLast(), table.issueDate.asc().nullsLast()),
	uniqueIndex("quotations_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`(number IS NOT NULL)`),
	index("quotations_party_idx").using("btree", table.organizationId.asc().nullsLast(), table.customerId.asc().nullsLast()),
	index("quotations_status_idx").using("btree", table.organizationId.asc().nullsLast(), table.status.asc().nullsLast()),
	unique("quotations_org_id_uq").on(table.organizationId, table.id),check("quotations_amounts_check", sql`((subtotal_paise >= 0) AND (discount_paise >= 0) AND (tax_paise >= 0) AND (total_paise >= 0))`),check("quotations_status_check", sql`(status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'converted'::text, 'void'::text]))`),]);

export const refunds = pgTable("refunds", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	customerId: text("customer_id").notNull(),
	paymentId: text("payment_id"),
	creditNoteId: text("credit_note_id"),
	accountId: text("account_id"),
	number: text(),
	refundDate: date("refund_date").notNull(),
	amountPaise: bigint("amount_paise", { mode: 'number' }).notNull(),
	method: text().notNull(),
	reference: text(),
	notes: text(),
	status: text().default("recorded").notNull(),
	voidedAt: timestamp("voided_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.accountId],
		foreignColumns: [accounts.organizationId, accounts.id],
		name: "refunds_account_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.creditNoteId],
		foreignColumns: [creditNotes.organizationId, creditNotes.id],
		name: "refunds_credit_note_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.customerId],
		foreignColumns: [customers.organizationId, customers.id],
		name: "refunds_customer_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.paymentId],
		foreignColumns: [businessPayments.organizationId, businessPayments.id],
		name: "refunds_payment_fk"
	}),
	index("refunds_customer_idx").using("btree", table.organizationId.asc().nullsLast(), table.customerId.asc().nullsLast()),
	index("refunds_date_idx").using("btree", table.organizationId.asc().nullsLast(), table.refundDate.asc().nullsLast()),
	uniqueIndex("refunds_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`(number IS NOT NULL)`),
check("refunds_amount_check", sql`(amount_paise > 0)`),check("refunds_method_check", sql`(method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'upi'::text, 'card'::text, 'cheque'::text, 'other'::text]))`),check("refunds_source_check", sql`(num_nonnulls(payment_id, credit_note_id) >= 1)`),check("refunds_status_check", sql`(status = ANY (ARRAY['recorded'::text, 'void'::text]))`),]);

export const salesOrderItems = pgTable("sales_order_items", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	lineNo: integer("line_no").notNull(),
	productId: text("product_id"),
	serviceId: text("service_id"),
	description: text().notNull(),
	hsnSac: text("hsn_sac"),
	quantity: numeric({ mode: 'number', precision: 15, scale: 3 }).default(1).notNull(),
	unitCode: text("unit_code"),
	ratePaise: bigint("rate_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxRate: numeric("tax_rate", { mode: 'number', precision: 7, scale: 4 }).default(0).notNull(),
	taxablePaise: bigint("taxable_paise", { mode: 'number' }).default(0).notNull(),
	cgstPaise: bigint("cgst_paise", { mode: 'number' }).default(0).notNull(),
	sgstPaise: bigint("sgst_paise", { mode: 'number' }).default(0).notNull(),
	igstPaise: bigint("igst_paise", { mode: 'number' }).default(0).notNull(),
	cessPaise: bigint("cess_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	salesOrderId: text("sales_order_id").notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.salesOrderId],
		foreignColumns: [salesOrders.organizationId, salesOrders.id],
		name: "sales_order_items_parent_fk"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.organizationId, table.productId],
		foreignColumns: [products.organizationId, products.id],
		name: "sales_order_items_product_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.serviceId],
		foreignColumns: [services.organizationId, services.id],
		name: "sales_order_items_service_fk"
	}),
	index("sales_order_items_parent_idx").using("btree", table.organizationId.asc().nullsLast(), table.salesOrderId.asc().nullsLast()),
	index("sales_order_items_product_idx").using("btree", table.organizationId.asc().nullsLast(), table.productId.asc().nullsLast()),
	unique("sales_order_items_line_uq").on(table.organizationId, table.salesOrderId, table.lineNo),check("sales_order_items_amounts_check", sql`((rate_paise >= 0) AND (discount_paise >= 0) AND (total_paise >= 0))`),check("sales_order_items_line_no_check", sql`(line_no >= 1)`),check("sales_order_items_one_item_check", sql`(num_nonnulls(product_id, service_id) <= 1)`),check("sales_order_items_quantity_check", sql`(quantity >= (0)::numeric)`),check("sales_order_items_tax_rate_check", sql`((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric))`),]);

export const salesOrders = pgTable("sales_orders", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	branchId: text("branch_id"),
	number: text(),
	issueDate: date("issue_date").notNull(),
	status: text().notNull(),
	placeOfSupply: text("place_of_supply"),
	currency: text().default("INR").notNull(),
	subtotalPaise: bigint("subtotal_paise", { mode: 'number' }).default(0).notNull(),
	discountPaise: bigint("discount_paise", { mode: 'number' }).default(0).notNull(),
	taxPaise: bigint("tax_paise", { mode: 'number' }).default(0).notNull(),
	roundOffPaise: bigint("round_off_paise", { mode: 'number' }).default(0).notNull(),
	totalPaise: bigint("total_paise", { mode: 'number' }).default(0).notNull(),
	notes: text(),
	terms: text(),
	voidedAt: timestamp("voided_at"),
	voidReason: text("void_reason"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	customerId: text("customer_id").notNull(),
	partyName: text("party_name"),
	partyGstin: text("party_gstin"),
	billingAddress: jsonb("billing_address"),
	shippingAddress: jsonb("shipping_address"),
	quotationId: text("quotation_id"),
	expectedDate: date("expected_date"),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.branchId],
		foreignColumns: [companyBranches.organizationId, companyBranches.id],
		name: "sales_orders_branch_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.customerId],
		foreignColumns: [customers.organizationId, customers.id],
		name: "sales_orders_party_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.quotationId],
		foreignColumns: [quotations.organizationId, quotations.id],
		name: "sales_orders_quotation_fk"
	}),
	index("sales_orders_date_idx").using("btree", table.organizationId.asc().nullsLast(), table.issueDate.asc().nullsLast()),
	uniqueIndex("sales_orders_number_uq").using("btree", table.organizationId.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`(number IS NOT NULL)`),
	index("sales_orders_party_idx").using("btree", table.organizationId.asc().nullsLast(), table.customerId.asc().nullsLast()),
	index("sales_orders_status_idx").using("btree", table.organizationId.asc().nullsLast(), table.status.asc().nullsLast()),
	unique("sales_orders_org_id_uq").on(table.organizationId, table.id),check("sales_orders_amounts_check", sql`((subtotal_paise >= 0) AND (discount_paise >= 0) AND (tax_paise >= 0) AND (total_paise >= 0))`),check("sales_orders_status_check", sql`(status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'fulfilled'::text, 'invoiced'::text, 'void'::text]))`),]);

export const services = pgTable("services", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	code: text(),
	name: text().notNull(),
	description: text(),
	unitId: text("unit_id"),
	sacCode: text("sac_code"),
	taxRate: numeric("tax_rate", { mode: 'number', precision: 7, scale: 4 }).default(0).notNull(),
	ratePaise: bigint("rate_paise", { mode: 'number' }).default(0).notNull(),
	archivedAt: timestamp("archived_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	categoryId: text("category_id"),
}, (table) => [
	foreignKey({
		columns: [table.organizationId, table.categoryId],
		foreignColumns: [productCategories.organizationId, productCategories.id],
		name: "services_category_fk"
	}),
	foreignKey({
		columns: [table.organizationId, table.unitId],
		foreignColumns: [units.organizationId, units.id],
		name: "services_unit_fk"
	}),
	uniqueIndex("services_code_uq").using("btree", table.organizationId.asc().nullsLast(), table.code.asc().nullsLast()).where(sql`(code IS NOT NULL)`),
	index("services_name_idx").using("btree", table.organizationId.asc().nullsLast(), table.name.asc().nullsLast()),
	unique("services_org_id_uq").on(table.organizationId, table.id),check("services_rate_check", sql`(rate_paise >= 0)`),check("services_tax_rate_check", sql`((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric))`),]);

export const session = pgTable("session", {
	id: text().primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	activeOrganizationId: text("active_organization_id"),
}, (table) => [
	index("session_userId_idx").using("btree", table.userId.asc().nullsLast()),
	unique("session_token_key").on(table.token),]);

export const subscriptionPayment = pgTable("subscription_payment", {
	id: text().primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	provider: text().default("payu").notNull(),
	txnid: text().notNull(),
	providerPaymentId: text("provider_payment_id"),
	status: text().notNull(),
	seats: integer().notNull(),
	amountPaise: bigint("amount_paise", { mode: 'number' }).notNull(),
	currency: text().default("INR").notNull(),
	description: text(),
	paymentMode: text("payment_mode"),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	planId: text("plan_id"),
	billingCycle: text("billing_cycle"),
}, (table) => [
	index("subscription_payment_org_created_idx").using("btree", table.organizationId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
	unique("subscription_payment_txnid_key").on(table.txnid),]);

export const suppliers = pgTable("suppliers", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	code: text(),
	name: text().notNull(),
	displayName: text("display_name"),
	gstin: text(),
	pan: text(),
	email: text(),
	phone: text(),
	addressLine1: text("address_line1"),
	addressLine2: text("address_line2"),
	city: text(),
	state: text(),
	stateCode: text("state_code"),
	postalCode: text("postal_code"),
	countryCode: text("country_code").default("IN").notNull(),
	paymentTermsDays: integer("payment_terms_days"),
	openingBalancePaise: bigint("opening_balance_paise", { mode: 'number' }).default(0).notNull(),
	notes: text(),
	archivedAt: timestamp("archived_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
	contactPerson: text("contact_person"),
	bankName: text("bank_name"),
	bankAccountName: text("bank_account_name"),
	bankAccountNumber: text("bank_account_number"),
	bankIfsc: text("bank_ifsc"),
}, (table) => [
	uniqueIndex("suppliers_active_gstin_uq").using("btree", table.organizationId.asc().nullsLast(), table.gstin.asc().nullsLast()).where(sql`((gstin IS NOT NULL) AND (archived_at IS NULL))`),
	uniqueIndex("suppliers_code_uq").using("btree", table.organizationId.asc().nullsLast(), table.code.asc().nullsLast()).where(sql`(code IS NOT NULL)`),
	index("suppliers_gstin_idx").using("btree", table.organizationId.asc().nullsLast(), table.gstin.asc().nullsLast()),
	index("suppliers_name_idx").using("btree", table.organizationId.asc().nullsLast(), table.name.asc().nullsLast()),
	unique("suppliers_org_id_uq").on(table.organizationId, table.id),check("suppliers_terms_check", sql`((payment_terms_days IS NULL) OR (payment_terms_days >= 0))`),]);

export const units = pgTable("units", {
	id: text().default(sql`gen_random_uuid()`).primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "restrict" } ),
	code: text().notNull(),
	name: text().notNull(),
	decimalPlaces: integer("decimal_places").default(0).notNull(),
	archivedAt: timestamp("archived_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" } ),
	updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	unique("units_code_uq").on(table.organizationId, table.code),	unique("units_org_id_uq").on(table.organizationId, table.id),check("units_decimals_check", sql`((decimal_places >= 0) AND (decimal_places <= 3))`),]);

export const user = pgTable("user", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	phone: text(),
}, (table) => [
	unique("user_email_key").on(table.email),]);

export const verification = pgTable("verification", {
	id: text().primaryKey(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("verification_identifier_idx").using("btree", table.identifier.asc().nullsLast()),
]);
