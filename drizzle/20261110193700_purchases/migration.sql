CREATE TABLE "purchase_return_items" (
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
	"discount" jsonb,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"gross_paise" bigint DEFAULT 0 NOT NULL,
	"invoice_discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_category" text DEFAULT 'taxable' NOT NULL,
	"tax_rate" numeric(7,4) DEFAULT '0' NOT NULL,
	"cess_rate" numeric(7,4) DEFAULT '0' NOT NULL,
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
	"purchase_return_id" text NOT NULL,
	CONSTRAINT "purchase_return_items_line_uq" UNIQUE("organization_id","purchase_return_id","line_no"),
	CONSTRAINT "purchase_return_items_one_item_check" CHECK (num_nonnulls("product_id", "service_id") <= 1),
	CONSTRAINT "purchase_return_items_line_no_check" CHECK ("line_no" >= 1),
	CONSTRAINT "purchase_return_items_quantity_check" CHECK ("quantity" >= 0),
	CONSTRAINT "purchase_return_items_amounts_check" CHECK ("rate_paise" >= 0 and "discount_paise" >= 0 and "total_paise" >= 0),
	CONSTRAINT "purchase_return_items_tax_rate_check" CHECK ("tax_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "purchase_returns" (
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
	"prices_include_tax" boolean DEFAULT false NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"zero_rated" text,
	"supply_type" text,
	"invoice_discount" jsonb,
	"charges" jsonb DEFAULT '[]' NOT NULL,
	"taxable_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"seller" jsonb,
	"financial_year" text,
	"sequence_number" bigint,
	"issued_at" timestamp,
	"notes" text,
	"terms" text,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"supplier_id" text NOT NULL,
	"party_name" text,
	"party_gstin" text,
	"billing_address" jsonb,
	"shipping_address" jsonb,
	"purchase_bill_id" text,
	"reason" text,
	CONSTRAINT "purchase_returns_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "purchase_returns_status_check" CHECK ("status" in ('draft', 'issued', 'void')),
	CONSTRAINT "purchase_returns_amounts_check" CHECK ("subtotal_paise" >= 0 and "discount_paise" >= 0 and "tax_paise" >= 0 and "total_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "party_name" text;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "party_gstin" text;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "billing_address" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "shipping_address" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "party_name" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "party_gstin" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "billing_address" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "shipping_address" jsonb;--> statement-breakpoint
CREATE INDEX "purchase_return_items_parent_idx" ON "purchase_return_items" ("organization_id","purchase_return_id");--> statement-breakpoint
CREATE INDEX "purchase_return_items_product_idx" ON "purchase_return_items" ("organization_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_returns_number_uq" ON "purchase_returns" ("organization_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "purchase_returns_date_idx" ON "purchase_returns" ("organization_id","issue_date");--> statement-breakpoint
CREATE INDEX "purchase_returns_status_idx" ON "purchase_returns" ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_returns_party_idx" ON "purchase_returns" ("organization_id","supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_returns_bill_idx" ON "purchase_returns" ("organization_id","purchase_bill_id");--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_parent_fk" FOREIGN KEY ("organization_id","purchase_return_id") REFERENCES "purchase_returns"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "services"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "company_branches"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_party_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "suppliers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_bill_fk" FOREIGN KEY ("organization_id","purchase_bill_id") REFERENCES "purchase_bills"("organization_id","id");--> statement-breakpoint
ALTER TABLE "invoice_sequences" DROP CONSTRAINT "invoice_sequences_type_check", ADD CONSTRAINT "invoice_sequences_type_check" CHECK ("document_type" in ('invoice', 'quotation', 'sales_order', 'credit_note', 'debit_note', 'payment', 'refund', 'purchase_order', 'purchase_bill', 'journal_entry', 'purchase_return', 'supplier_payment'));