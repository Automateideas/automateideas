CREATE TABLE "accounts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "accounts_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "accounts_code_uq" UNIQUE("organization_id","code"),
	CONSTRAINT "accounts_type_check" CHECK ("type" in ('asset', 'liability', 'equity', 'income', 'expense'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"changes" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_files" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"storage_key" text NOT NULL UNIQUE,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text,
	"entity_type" text,
	"entity_id" text,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_files_size_check" CHECK ("size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "business_invoice_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" text,
	"service_id" text,
	"description" text NOT NULL,
	"hsn_sac" text,
	"quantity" numeric(15,3) DEFAULT '1' NOT NULL,
	"unit_code" text,
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_rate" numeric(7,4) DEFAULT '0' NOT NULL,
	"taxable_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"invoice_id" text NOT NULL,
	CONSTRAINT "business_invoice_items_line_uq" UNIQUE("organization_id","invoice_id","line_no"),
	CONSTRAINT "business_invoice_items_one_item_check" CHECK (num_nonnulls("product_id", "service_id") <= 1),
	CONSTRAINT "business_invoice_items_line_no_check" CHECK ("line_no" >= 1),
	CONSTRAINT "business_invoice_items_quantity_check" CHECK ("quantity" >= 0),
	CONSTRAINT "business_invoice_items_amounts_check" CHECK ("rate_paise" >= 0 and "discount_paise" >= 0 and "total_paise" >= 0),
	CONSTRAINT "business_invoice_items_tax_rate_check" CHECK ("tax_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "business_invoices" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"branch_id" text,
	"number" text,
	"issue_date" date NOT NULL,
	"status" text NOT NULL,
	"place_of_supply" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"customer_id" text NOT NULL,
	"party_name" text,
	"party_gstin" text,
	"billing_address" jsonb,
	"shipping_address" jsonb,
	"due_date" date,
	"quotation_id" text,
	"sales_order_id" text,
	CONSTRAINT "business_invoices_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "business_invoices_status_check" CHECK ("status" in ('draft', 'issued', 'partially_paid', 'paid', 'void')),
	CONSTRAINT "business_invoices_amounts_check" CHECK ("subtotal_paise" >= 0 and "discount_paise" >= 0 and "tax_paise" >= 0 and "total_paise" >= 0),
	CONSTRAINT "business_invoices_due_check" CHECK ("due_date" is null or "due_date" >= "issue_date")
);
--> statement-breakpoint
CREATE TABLE "business_payments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"direction" text NOT NULL,
	"customer_id" text,
	"supplier_id" text,
	"account_id" text,
	"number" text,
	"payment_date" date NOT NULL,
	"amount_paise" bigint NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"notes" text,
	"status" text DEFAULT 'recorded' NOT NULL,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "business_payments_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "business_payments_party_check" CHECK (("direction" = 'received' and "customer_id" is not null and "supplier_id" is null)
        or ("direction" = 'made' and "supplier_id" is not null and "customer_id" is null)),
	CONSTRAINT "business_payments_amount_check" CHECK ("amount_paise" > 0),
	CONSTRAINT "business_payments_method_check" CHECK ("method" in ('cash', 'bank_transfer', 'upi', 'card', 'cheque', 'other')),
	CONSTRAINT "business_payments_status_check" CHECK ("status" in ('recorded', 'void'))
);
--> statement-breakpoint
CREATE TABLE "company_branches" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"gstin" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"state_code" text,
	"postal_code" text,
	"country_code" text DEFAULT 'IN' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "company_branches_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "company_branches_code_uq" UNIQUE("organization_id","code")
);
--> statement-breakpoint
CREATE TABLE "credit_note_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" text,
	"service_id" text,
	"description" text NOT NULL,
	"hsn_sac" text,
	"quantity" numeric(15,3) DEFAULT '1' NOT NULL,
	"unit_code" text,
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_rate" numeric(7,4) DEFAULT '0' NOT NULL,
	"taxable_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"credit_note_id" text NOT NULL,
	CONSTRAINT "credit_note_items_line_uq" UNIQUE("organization_id","credit_note_id","line_no"),
	CONSTRAINT "credit_note_items_one_item_check" CHECK (num_nonnulls("product_id", "service_id") <= 1),
	CONSTRAINT "credit_note_items_line_no_check" CHECK ("line_no" >= 1),
	CONSTRAINT "credit_note_items_quantity_check" CHECK ("quantity" >= 0),
	CONSTRAINT "credit_note_items_amounts_check" CHECK ("rate_paise" >= 0 and "discount_paise" >= 0 and "total_paise" >= 0),
	CONSTRAINT "credit_note_items_tax_rate_check" CHECK ("tax_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"branch_id" text,
	"number" text,
	"issue_date" date NOT NULL,
	"status" text NOT NULL,
	"place_of_supply" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"customer_id" text NOT NULL,
	"party_name" text,
	"party_gstin" text,
	"billing_address" jsonb,
	"shipping_address" jsonb,
	"invoice_id" text,
	"reason" text,
	CONSTRAINT "credit_notes_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "credit_notes_status_check" CHECK ("status" in ('draft', 'issued', 'void')),
	CONSTRAINT "credit_notes_amounts_check" CHECK ("subtotal_paise" >= 0 and "discount_paise" >= 0 and "tax_paise" >= 0 and "total_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"state_code" text,
	"postal_code" text,
	"country_code" text DEFAULT 'IN' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "customer_addresses_type_check" CHECK ("type" in ('billing', 'shipping'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"display_name" text,
	"gstin" text,
	"pan" text,
	"email" text,
	"phone" text,
	"place_of_supply" text,
	"payment_terms_days" integer,
	"credit_limit_paise" bigint,
	"opening_balance_paise" bigint DEFAULT 0 NOT NULL,
	"price_list_id" text,
	"notes" text,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "customers_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "customers_terms_check" CHECK ("payment_terms_days" is null or "payment_terms_days" >= 0),
	CONSTRAINT "customers_credit_check" CHECK ("credit_limit_paise" is null or "credit_limit_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "debit_note_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" text,
	"service_id" text,
	"description" text NOT NULL,
	"hsn_sac" text,
	"quantity" numeric(15,3) DEFAULT '1' NOT NULL,
	"unit_code" text,
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_rate" numeric(7,4) DEFAULT '0' NOT NULL,
	"taxable_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"debit_note_id" text NOT NULL,
	CONSTRAINT "debit_note_items_line_uq" UNIQUE("organization_id","debit_note_id","line_no"),
	CONSTRAINT "debit_note_items_one_item_check" CHECK (num_nonnulls("product_id", "service_id") <= 1),
	CONSTRAINT "debit_note_items_line_no_check" CHECK ("line_no" >= 1),
	CONSTRAINT "debit_note_items_quantity_check" CHECK ("quantity" >= 0),
	CONSTRAINT "debit_note_items_amounts_check" CHECK ("rate_paise" >= 0 and "discount_paise" >= 0 and "total_paise" >= 0),
	CONSTRAINT "debit_note_items_tax_rate_check" CHECK ("tax_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "debit_notes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"branch_id" text,
	"number" text,
	"issue_date" date NOT NULL,
	"status" text NOT NULL,
	"place_of_supply" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"customer_id" text NOT NULL,
	"party_name" text,
	"party_gstin" text,
	"billing_address" jsonb,
	"shipping_address" jsonb,
	"invoice_id" text,
	"reason" text,
	CONSTRAINT "debit_notes_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "debit_notes_status_check" CHECK ("status" in ('draft', 'issued', 'void')),
	CONSTRAINT "debit_notes_amounts_check" CHECK ("subtotal_paise" >= 0 and "discount_paise" >= 0 and "tax_paise" >= 0 and "total_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_sequences" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"branch_id" text,
	"document_type" text NOT NULL,
	"financial_year" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"next_number" bigint DEFAULT 1 NOT NULL,
	"padding" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "invoice_sequences_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "invoice_sequences_series_uq" UNIQUE NULLS NOT DISTINCT("organization_id","branch_id","document_type","financial_year"),
	CONSTRAINT "invoice_sequences_type_check" CHECK ("document_type" in ('invoice', 'quotation', 'sales_order', 'credit_note', 'debit_note', 'payment', 'refund', 'purchase_order', 'purchase_bill', 'journal_entry')),
	CONSTRAINT "invoice_sequences_next_check" CHECK ("next_number" >= 1),
	CONSTRAINT "invoice_sequences_padding_check" CHECK ("padding" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"number" text,
	"entry_date" date NOT NULL,
	"narration" text,
	"source_type" text NOT NULL,
	"source_id" text,
	"posted_at" timestamp,
	"reverses_entry_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "journal_entries_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"account_id" text NOT NULL,
	"customer_id" text,
	"supplier_id" text,
	"debit_paise" bigint DEFAULT 0 NOT NULL,
	"credit_paise" bigint DEFAULT 0 NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "journal_lines_line_uq" UNIQUE("organization_id","entry_id","line_no"),
	CONSTRAINT "journal_lines_side_check" CHECK (("debit_paise" > 0 and "credit_paise" = 0) or ("credit_paise" > 0 and "debit_paise" = 0)),
	CONSTRAINT "journal_lines_one_party_check" CHECK (num_nonnulls("customer_id", "supplier_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"invoice_id" text,
	"purchase_bill_id" text,
	"amount_paise" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "payment_allocations_one_target_check" CHECK (num_nonnulls("invoice_id", "purchase_bill_id") = 1),
	CONSTRAINT "payment_allocations_amount_check" CHECK ("amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"price_list_id" text NOT NULL,
	"product_id" text,
	"service_id" text,
	"price_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "price_list_items_one_item_check" CHECK (num_nonnulls("product_id", "service_id") = 1),
	CONSTRAINT "price_list_items_price_check" CHECK ("price_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "price_lists_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "price_lists_name_uq" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "product_categories_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "product_categories_name_uq" UNIQUE NULLS NOT DISTINCT("organization_id","parent_id","name")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"description" text,
	"category_id" text,
	"unit_id" text NOT NULL,
	"hsn_code" text,
	"tax_rate" numeric(7,4) DEFAULT '0' NOT NULL,
	"sale_price_paise" bigint DEFAULT 0 NOT NULL,
	"purchase_price_paise" bigint DEFAULT 0 NOT NULL,
	"track_inventory" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "products_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "products_tax_rate_check" CHECK ("tax_rate" between 0 and 100),
	CONSTRAINT "products_prices_check" CHECK ("sale_price_paise" >= 0 and "purchase_price_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_bill_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" text,
	"service_id" text,
	"description" text NOT NULL,
	"hsn_sac" text,
	"quantity" numeric(15,3) DEFAULT '1' NOT NULL,
	"unit_code" text,
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_rate" numeric(7,4) DEFAULT '0' NOT NULL,
	"taxable_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"purchase_bill_id" text NOT NULL,
	CONSTRAINT "purchase_bill_items_line_uq" UNIQUE("organization_id","purchase_bill_id","line_no"),
	CONSTRAINT "purchase_bill_items_one_item_check" CHECK (num_nonnulls("product_id", "service_id") <= 1),
	CONSTRAINT "purchase_bill_items_line_no_check" CHECK ("line_no" >= 1),
	CONSTRAINT "purchase_bill_items_quantity_check" CHECK ("quantity" >= 0),
	CONSTRAINT "purchase_bill_items_amounts_check" CHECK ("rate_paise" >= 0 and "discount_paise" >= 0 and "total_paise" >= 0),
	CONSTRAINT "purchase_bill_items_tax_rate_check" CHECK ("tax_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "purchase_bills" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"branch_id" text,
	"number" text,
	"issue_date" date NOT NULL,
	"status" text NOT NULL,
	"place_of_supply" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"supplier_id" text NOT NULL,
	"supplier_bill_number" text,
	"due_date" date,
	"purchase_order_id" text,
	CONSTRAINT "purchase_bills_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "purchase_bills_status_check" CHECK ("status" in ('draft', 'recorded', 'partially_paid', 'paid', 'void')),
	CONSTRAINT "purchase_bills_amounts_check" CHECK ("subtotal_paise" >= 0 and "discount_paise" >= 0 and "tax_paise" >= 0 and "total_paise" >= 0),
	CONSTRAINT "purchase_bills_due_check" CHECK ("due_date" is null or "due_date" >= "issue_date")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" text,
	"service_id" text,
	"description" text NOT NULL,
	"hsn_sac" text,
	"quantity" numeric(15,3) DEFAULT '1' NOT NULL,
	"unit_code" text,
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_rate" numeric(7,4) DEFAULT '0' NOT NULL,
	"taxable_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"purchase_order_id" text NOT NULL,
	CONSTRAINT "purchase_order_items_line_uq" UNIQUE("organization_id","purchase_order_id","line_no"),
	CONSTRAINT "purchase_order_items_one_item_check" CHECK (num_nonnulls("product_id", "service_id") <= 1),
	CONSTRAINT "purchase_order_items_line_no_check" CHECK ("line_no" >= 1),
	CONSTRAINT "purchase_order_items_quantity_check" CHECK ("quantity" >= 0),
	CONSTRAINT "purchase_order_items_amounts_check" CHECK ("rate_paise" >= 0 and "discount_paise" >= 0 and "total_paise" >= 0),
	CONSTRAINT "purchase_order_items_tax_rate_check" CHECK ("tax_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"branch_id" text,
	"number" text,
	"issue_date" date NOT NULL,
	"status" text NOT NULL,
	"place_of_supply" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"supplier_id" text NOT NULL,
	"expected_date" date,
	CONSTRAINT "purchase_orders_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "purchase_orders_status_check" CHECK ("status" in ('draft', 'sent', 'received', 'billed', 'void')),
	CONSTRAINT "purchase_orders_amounts_check" CHECK ("subtotal_paise" >= 0 and "discount_paise" >= 0 and "tax_paise" >= 0 and "total_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" text,
	"service_id" text,
	"description" text NOT NULL,
	"hsn_sac" text,
	"quantity" numeric(15,3) DEFAULT '1' NOT NULL,
	"unit_code" text,
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_rate" numeric(7,4) DEFAULT '0' NOT NULL,
	"taxable_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"quotation_id" text NOT NULL,
	CONSTRAINT "quotation_items_line_uq" UNIQUE("organization_id","quotation_id","line_no"),
	CONSTRAINT "quotation_items_one_item_check" CHECK (num_nonnulls("product_id", "service_id") <= 1),
	CONSTRAINT "quotation_items_line_no_check" CHECK ("line_no" >= 1),
	CONSTRAINT "quotation_items_quantity_check" CHECK ("quantity" >= 0),
	CONSTRAINT "quotation_items_amounts_check" CHECK ("rate_paise" >= 0 and "discount_paise" >= 0 and "total_paise" >= 0),
	CONSTRAINT "quotation_items_tax_rate_check" CHECK ("tax_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"branch_id" text,
	"number" text,
	"issue_date" date NOT NULL,
	"status" text NOT NULL,
	"place_of_supply" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"customer_id" text NOT NULL,
	"party_name" text,
	"party_gstin" text,
	"billing_address" jsonb,
	"shipping_address" jsonb,
	"valid_until" date,
	CONSTRAINT "quotations_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "quotations_status_check" CHECK ("status" in ('draft', 'sent', 'accepted', 'declined', 'expired', 'converted', 'void')),
	CONSTRAINT "quotations_amounts_check" CHECK ("subtotal_paise" >= 0 and "discount_paise" >= 0 and "tax_paise" >= 0 and "total_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"payment_id" text,
	"credit_note_id" text,
	"account_id" text,
	"number" text,
	"refund_date" date NOT NULL,
	"amount_paise" bigint NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"notes" text,
	"status" text DEFAULT 'recorded' NOT NULL,
	"voided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "refunds_source_check" CHECK (num_nonnulls("payment_id", "credit_note_id") >= 1),
	CONSTRAINT "refunds_amount_check" CHECK ("amount_paise" > 0),
	CONSTRAINT "refunds_method_check" CHECK ("method" in ('cash', 'bank_transfer', 'upi', 'card', 'cheque', 'other')),
	CONSTRAINT "refunds_status_check" CHECK ("status" in ('recorded', 'void'))
);
--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" text,
	"service_id" text,
	"description" text NOT NULL,
	"hsn_sac" text,
	"quantity" numeric(15,3) DEFAULT '1' NOT NULL,
	"unit_code" text,
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_rate" numeric(7,4) DEFAULT '0' NOT NULL,
	"taxable_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"sales_order_id" text NOT NULL,
	CONSTRAINT "sales_order_items_line_uq" UNIQUE("organization_id","sales_order_id","line_no"),
	CONSTRAINT "sales_order_items_one_item_check" CHECK (num_nonnulls("product_id", "service_id") <= 1),
	CONSTRAINT "sales_order_items_line_no_check" CHECK ("line_no" >= 1),
	CONSTRAINT "sales_order_items_quantity_check" CHECK ("quantity" >= 0),
	CONSTRAINT "sales_order_items_amounts_check" CHECK ("rate_paise" >= 0 and "discount_paise" >= 0 and "total_paise" >= 0),
	CONSTRAINT "sales_order_items_tax_rate_check" CHECK ("tax_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"branch_id" text,
	"number" text,
	"issue_date" date NOT NULL,
	"status" text NOT NULL,
	"place_of_supply" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"customer_id" text NOT NULL,
	"party_name" text,
	"party_gstin" text,
	"billing_address" jsonb,
	"shipping_address" jsonb,
	"quotation_id" text,
	"expected_date" date,
	CONSTRAINT "sales_orders_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "sales_orders_status_check" CHECK ("status" in ('draft', 'confirmed', 'fulfilled', 'invoiced', 'void')),
	CONSTRAINT "sales_orders_amounts_check" CHECK ("subtotal_paise" >= 0 and "discount_paise" >= 0 and "tax_paise" >= 0 and "total_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"unit_id" text,
	"sac_code" text,
	"tax_rate" numeric(7,4) DEFAULT '0' NOT NULL,
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "services_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "services_tax_rate_check" CHECK ("tax_rate" between 0 and 100),
	CONSTRAINT "services_rate_check" CHECK ("rate_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"display_name" text,
	"gstin" text,
	"pan" text,
	"email" text,
	"phone" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"state_code" text,
	"postal_code" text,
	"country_code" text DEFAULT 'IN' NOT NULL,
	"payment_terms_days" integer,
	"opening_balance_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "suppliers_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "suppliers_terms_check" CHECK ("payment_terms_days" is null or "payment_terms_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"decimal_places" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "units_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "units_code_uq" UNIQUE("organization_id","code"),
	CONSTRAINT "units_decimals_check" CHECK ("decimal_places" between 0 and 3)
);
--> statement-breakpoint
CREATE INDEX "accounts_parent_idx" ON "accounts" ("organization_id","parent_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "billing_files_entity_idx" ON "billing_files" ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "business_invoice_items_parent_idx" ON "business_invoice_items" ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "business_invoice_items_product_idx" ON "business_invoice_items" ("organization_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_invoices_number_uq" ON "business_invoices" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "business_invoices_date_idx" ON "business_invoices" ("organization_id","issue_date");--> statement-breakpoint
CREATE INDEX "business_invoices_status_idx" ON "business_invoices" ("organization_id","status");--> statement-breakpoint
CREATE INDEX "business_invoices_party_idx" ON "business_invoices" ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "business_invoices_due_idx" ON "business_invoices" ("organization_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "business_payments_number_uq" ON "business_payments" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "business_payments_date_idx" ON "business_payments" ("organization_id","payment_date");--> statement-breakpoint
CREATE INDEX "business_payments_customer_idx" ON "business_payments" ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "business_payments_supplier_idx" ON "business_payments" ("organization_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_branches_one_default_uq" ON "company_branches" ("organization_id") WHERE "is_default";--> statement-breakpoint
CREATE INDEX "credit_note_items_parent_idx" ON "credit_note_items" ("organization_id","credit_note_id");--> statement-breakpoint
CREATE INDEX "credit_note_items_product_idx" ON "credit_note_items" ("organization_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_number_uq" ON "credit_notes" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "credit_notes_date_idx" ON "credit_notes" ("organization_id","issue_date");--> statement-breakpoint
CREATE INDEX "credit_notes_status_idx" ON "credit_notes" ("organization_id","status");--> statement-breakpoint
CREATE INDEX "credit_notes_party_idx" ON "credit_notes" ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_idx" ON "credit_notes" ("organization_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default_uq" ON "customer_addresses" ("organization_id","customer_id","type") WHERE "is_default";--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" ("organization_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_code_uq" ON "customers" ("organization_id","code") WHERE "code" is not null;--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" ("organization_id","name");--> statement-breakpoint
CREATE INDEX "customers_gstin_idx" ON "customers" ("organization_id","gstin");--> statement-breakpoint
CREATE INDEX "debit_note_items_parent_idx" ON "debit_note_items" ("organization_id","debit_note_id");--> statement-breakpoint
CREATE INDEX "debit_note_items_product_idx" ON "debit_note_items" ("organization_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debit_notes_number_uq" ON "debit_notes" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "debit_notes_date_idx" ON "debit_notes" ("organization_id","issue_date");--> statement-breakpoint
CREATE INDEX "debit_notes_status_idx" ON "debit_notes" ("organization_id","status");--> statement-breakpoint
CREATE INDEX "debit_notes_party_idx" ON "debit_notes" ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "debit_notes_invoice_idx" ON "debit_notes" ("organization_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_number_uq" ON "journal_entries" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_one_reversal_uq" ON "journal_entries" ("organization_id","reverses_entry_id") WHERE "reverses_entry_id" is not null;--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" ("organization_id","entry_date");--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" ("organization_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" ("organization_id","entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" ("organization_id","account_id");--> statement-breakpoint
CREATE INDEX "journal_lines_customer_idx" ON "journal_lines" ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "journal_lines_supplier_idx" ON "journal_lines" ("organization_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_invoice_uq" ON "payment_allocations" ("organization_id","payment_id","invoice_id") WHERE "invoice_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_bill_uq" ON "payment_allocations" ("organization_id","payment_id","purchase_bill_id") WHERE "purchase_bill_id" is not null;--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_bill_idx" ON "payment_allocations" ("organization_id","purchase_bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_items_product_uq" ON "price_list_items" ("organization_id","price_list_id","product_id") WHERE "product_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_items_service_uq" ON "price_list_items" ("organization_id","price_list_id","service_id") WHERE "service_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_one_default_uq" ON "price_lists" ("organization_id") WHERE "is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_uq" ON "products" ("organization_id","sku") WHERE "sku" is not null;--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" ("organization_id","name");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" ("organization_id","category_id");--> statement-breakpoint
CREATE INDEX "purchase_bill_items_parent_idx" ON "purchase_bill_items" ("organization_id","purchase_bill_id");--> statement-breakpoint
CREATE INDEX "purchase_bill_items_product_idx" ON "purchase_bill_items" ("organization_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_bills_number_uq" ON "purchase_bills" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "purchase_bills_date_idx" ON "purchase_bills" ("organization_id","issue_date");--> statement-breakpoint
CREATE INDEX "purchase_bills_status_idx" ON "purchase_bills" ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_bills_party_idx" ON "purchase_bills" ("organization_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_bills_supplier_number_uq" ON "purchase_bills" ("organization_id","supplier_id","supplier_bill_number") WHERE "supplier_bill_number" is not null;--> statement-breakpoint
CREATE INDEX "purchase_bills_due_idx" ON "purchase_bills" ("organization_id","due_date");--> statement-breakpoint
CREATE INDEX "purchase_order_items_parent_idx" ON "purchase_order_items" ("organization_id","purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_items_product_idx" ON "purchase_order_items" ("organization_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_number_uq" ON "purchase_orders" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "purchase_orders_date_idx" ON "purchase_orders" ("organization_id","issue_date");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_orders_party_idx" ON "purchase_orders" ("organization_id","supplier_id");--> statement-breakpoint
CREATE INDEX "quotation_items_parent_idx" ON "quotation_items" ("organization_id","quotation_id");--> statement-breakpoint
CREATE INDEX "quotation_items_product_idx" ON "quotation_items" ("organization_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_number_uq" ON "quotations" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "quotations_date_idx" ON "quotations" ("organization_id","issue_date");--> statement-breakpoint
CREATE INDEX "quotations_status_idx" ON "quotations" ("organization_id","status");--> statement-breakpoint
CREATE INDEX "quotations_party_idx" ON "quotations" ("organization_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_number_uq" ON "refunds" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "refunds_customer_idx" ON "refunds" ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "refunds_date_idx" ON "refunds" ("organization_id","refund_date");--> statement-breakpoint
CREATE INDEX "sales_order_items_parent_idx" ON "sales_order_items" ("organization_id","sales_order_id");--> statement-breakpoint
CREATE INDEX "sales_order_items_product_idx" ON "sales_order_items" ("organization_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_number_uq" ON "sales_orders" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "sales_orders_date_idx" ON "sales_orders" ("organization_id","issue_date");--> statement-breakpoint
CREATE INDEX "sales_orders_status_idx" ON "sales_orders" ("organization_id","status");--> statement-breakpoint
CREATE INDEX "sales_orders_party_idx" ON "sales_orders" ("organization_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "services_code_uq" ON "services" ("organization_id","code") WHERE "code" is not null;--> statement-breakpoint
CREATE INDEX "services_name_idx" ON "services" ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_uq" ON "suppliers" ("organization_id","code") WHERE "code" is not null;--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" ("organization_id","name");--> statement-breakpoint
CREATE INDEX "suppliers_gstin_idx" ON "suppliers" ("organization_id","gstin");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_fk" FOREIGN KEY ("organization_id","parent_id") REFERENCES "accounts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "billing_files" ADD CONSTRAINT "billing_files_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "billing_files" ADD CONSTRAINT "billing_files_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD CONSTRAINT "business_invoice_items_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD CONSTRAINT "business_invoice_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD CONSTRAINT "business_invoice_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD CONSTRAINT "business_invoice_items_parent_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "business_invoices"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD CONSTRAINT "business_invoice_items_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD CONSTRAINT "business_invoice_items_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "services"("organization_id","id");--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "company_branches"("organization_id","id");--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_party_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_quotation_fk" FOREIGN KEY ("organization_id","quotation_id") REFERENCES "quotations"("organization_id","id");--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_sales_order_fk" FOREIGN KEY ("organization_id","sales_order_id") REFERENCES "sales_orders"("organization_id","id");--> statement-breakpoint
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_customer_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_supplier_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "suppliers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_account_fk" FOREIGN KEY ("organization_id","account_id") REFERENCES "accounts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "company_branches" ADD CONSTRAINT "company_branches_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "company_branches" ADD CONSTRAINT "company_branches_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "company_branches" ADD CONSTRAINT "company_branches_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_parent_fk" FOREIGN KEY ("organization_id","credit_note_id") REFERENCES "credit_notes"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "services"("organization_id","id");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "company_branches"("organization_id","id");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_party_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "business_invoices"("organization_id","id");--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_price_list_fk" FOREIGN KEY ("organization_id","price_list_id") REFERENCES "price_lists"("organization_id","id");--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_parent_fk" FOREIGN KEY ("organization_id","debit_note_id") REFERENCES "debit_notes"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "services"("organization_id","id");--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "company_branches"("organization_id","id");--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_party_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_invoice_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "business_invoices"("organization_id","id");--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "company_branches"("organization_id","id");--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reverses_fk" FOREIGN KEY ("organization_id","reverses_entry_id") REFERENCES "journal_entries"("organization_id","id");--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_fk" FOREIGN KEY ("organization_id","entry_id") REFERENCES "journal_entries"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_fk" FOREIGN KEY ("organization_id","account_id") REFERENCES "accounts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_customer_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_supplier_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "suppliers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_fk" FOREIGN KEY ("organization_id","payment_id") REFERENCES "business_payments"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "business_invoices"("organization_id","id");--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_bill_fk" FOREIGN KEY ("organization_id","purchase_bill_id") REFERENCES "purchase_bills"("organization_id","id");--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_list_fk" FOREIGN KEY ("organization_id","price_list_id") REFERENCES "price_lists"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "services"("organization_id","id");--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_fk" FOREIGN KEY ("organization_id","parent_id") REFERENCES "product_categories"("organization_id","id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_fk" FOREIGN KEY ("organization_id","category_id") REFERENCES "product_categories"("organization_id","id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_fk" FOREIGN KEY ("organization_id","unit_id") REFERENCES "units"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_parent_fk" FOREIGN KEY ("organization_id","purchase_bill_id") REFERENCES "purchase_bills"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "services"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "company_branches"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_party_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "suppliers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_order_fk" FOREIGN KEY ("organization_id","purchase_order_id") REFERENCES "purchase_orders"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_parent_fk" FOREIGN KEY ("organization_id","purchase_order_id") REFERENCES "purchase_orders"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "services"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "company_branches"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_party_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "suppliers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_parent_fk" FOREIGN KEY ("organization_id","quotation_id") REFERENCES "quotations"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "services"("organization_id","id");--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "company_branches"("organization_id","id");--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_party_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_customer_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_fk" FOREIGN KEY ("organization_id","payment_id") REFERENCES "business_payments"("organization_id","id");--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_credit_note_fk" FOREIGN KEY ("organization_id","credit_note_id") REFERENCES "credit_notes"("organization_id","id");--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_account_fk" FOREIGN KEY ("organization_id","account_id") REFERENCES "accounts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_parent_fk" FOREIGN KEY ("organization_id","sales_order_id") REFERENCES "sales_orders"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "services"("organization_id","id");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "company_branches"("organization_id","id");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_party_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotation_fk" FOREIGN KEY ("organization_id","quotation_id") REFERENCES "quotations"("organization_id","id");--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_unit_fk" FOREIGN KEY ("organization_id","unit_id") REFERENCES "units"("organization_id","id");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;