ALTER TABLE "billing_settings" ADD COLUMN "logo_file_id" text;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "show_logo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD COLUMN "discount" jsonb;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD COLUMN "gross_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD COLUMN "invoice_discount_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD COLUMN "tax_category" text DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD COLUMN "cess_rate" numeric(7,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "prices_include_tax" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "zero_rated" text;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "supply_type" text;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "invoice_discount" jsonb;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "charges" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "taxable_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "cess_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "seller" jsonb;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "financial_year" text;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "sequence_number" bigint;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "issued_at" timestamp;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD COLUMN "discount" jsonb;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD COLUMN "gross_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD COLUMN "invoice_discount_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD COLUMN "tax_category" text DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD COLUMN "cess_rate" numeric(7,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "prices_include_tax" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "zero_rated" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "supply_type" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "invoice_discount" jsonb;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "charges" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "taxable_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "cess_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "seller" jsonb;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "financial_year" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "sequence_number" bigint;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "issued_at" timestamp;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD COLUMN "discount" jsonb;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD COLUMN "gross_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD COLUMN "invoice_discount_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD COLUMN "tax_category" text DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD COLUMN "cess_rate" numeric(7,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "prices_include_tax" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "zero_rated" text;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "supply_type" text;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "invoice_discount" jsonb;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "charges" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "taxable_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "cess_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "seller" jsonb;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "financial_year" text;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "sequence_number" bigint;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "issued_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD COLUMN "discount" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD COLUMN "gross_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD COLUMN "invoice_discount_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD COLUMN "tax_category" text DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD COLUMN "cess_rate" numeric(7,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "prices_include_tax" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "zero_rated" text;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "supply_type" text;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "invoice_discount" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "charges" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "taxable_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "cess_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "seller" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "financial_year" text;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "sequence_number" bigint;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "issued_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "discount" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "gross_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "invoice_discount_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "tax_category" text DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "cess_rate" numeric(7,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "prices_include_tax" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "zero_rated" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "supply_type" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "invoice_discount" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "charges" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "taxable_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "cess_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "seller" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "financial_year" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "sequence_number" bigint;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "issued_at" timestamp;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "discount" jsonb;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "gross_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "invoice_discount_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "tax_category" text DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "cess_rate" numeric(7,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "prices_include_tax" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "zero_rated" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "supply_type" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "invoice_discount" jsonb;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "charges" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "taxable_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "cess_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "seller" jsonb;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "financial_year" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "sequence_number" bigint;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "issued_at" timestamp;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "discount" jsonb;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "gross_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "invoice_discount_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "tax_category" text DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "cess_rate" numeric(7,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "prices_include_tax" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "zero_rated" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "supply_type" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "invoice_discount" jsonb;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "charges" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "taxable_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "cess_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "seller" jsonb;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "financial_year" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "sequence_number" bigint;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "issued_at" timestamp;--> statement-breakpoint
ALTER TABLE "billing_files" ADD CONSTRAINT "billing_files_org_id_uq" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_logo_fk" FOREIGN KEY ("organization_id","logo_file_id") REFERENCES "billing_files"("organization_id","id");