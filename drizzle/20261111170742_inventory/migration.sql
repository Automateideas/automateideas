CREATE TABLE "stock_adjustment_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"adjustment_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" text NOT NULL,
	"quantity" numeric(15,3) NOT NULL,
	"unit_cost_paise" bigint,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "stock_adjustment_items_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "stock_adjustment_items_line_uq" UNIQUE("organization_id","adjustment_id","line_no"),
	CONSTRAINT "stock_adjustment_items_quantity_check" CHECK ("quantity" <> 0),
	CONSTRAINT "stock_adjustment_items_cost_check" CHECK ("unit_cost_paise" is null or "unit_cost_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"adjustment_date" date NOT NULL,
	"kind" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"to_warehouse_id" text,
	"reason" text,
	"notes" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"voided_at" timestamp,
	"void_reason" text,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "stock_adjustments_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "stock_adjustments_number_uq" UNIQUE("organization_id","number"),
	CONSTRAINT "stock_adjustments_kind_check" CHECK ("kind" in ('adjustment', 'transfer')),
	CONSTRAINT "stock_adjustments_status_check" CHECK ("status" in ('posted', 'void')),
	CONSTRAINT "stock_adjustments_reason_check" CHECK ("reason" is null or "reason" in ('opening', 'count', 'damaged', 'lost', 'expired', 'found', 'internal_use', 'other')),
	CONSTRAINT "stock_adjustments_transfer_check" CHECK (("kind" = 'transfer' and "to_warehouse_id" is not null and "to_warehouse_id" <> "warehouse_id") or ("kind" = 'adjustment' and "to_warehouse_id" is null))
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"product_id" text NOT NULL,
	"movement_date" date NOT NULL,
	"kind" text NOT NULL,
	"quantity" numeric(15,3) NOT NULL,
	"value_paise" bigint NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_line_id" text,
	"reverses_movement_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "stock_movements_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "stock_movements_kind_check" CHECK ("kind" in ('purchase', 'purchase_return', 'sale', 'sales_return', 'adjustment', 'transfer_out', 'transfer_in')),
	CONSTRAINT "stock_movements_quantity_check" CHECK ("quantity" <> 0)
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
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
	CONSTRAINT "warehouses_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "warehouses_code_uq" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "allow_negative_stock" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "warehouse_id" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "restock" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "warehouse_id" text;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "warehouse_id" text;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "warehouse_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_adjustments_idempotency_uq" ON "stock_adjustments" ("organization_id","idempotency_key") WHERE "idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "stock_adjustments_date_idx" ON "stock_adjustments" ("organization_id","adjustment_date");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_one_reversal_uq" ON "stock_movements" ("organization_id","reverses_movement_id") WHERE "reverses_movement_id" is not null;--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" ("organization_id","product_id","warehouse_id","movement_date");--> statement-breakpoint
CREATE INDEX "stock_movements_source_idx" ON "stock_movements" ("organization_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_one_default_uq" ON "warehouses" ("organization_id") WHERE "is_default";--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_warehouse_fk" FOREIGN KEY ("organization_id","warehouse_id") REFERENCES "warehouses"("organization_id","id");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_warehouse_fk" FOREIGN KEY ("organization_id","warehouse_id") REFERENCES "warehouses"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_warehouse_fk" FOREIGN KEY ("organization_id","warehouse_id") REFERENCES "warehouses"("organization_id","id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_warehouse_fk" FOREIGN KEY ("organization_id","warehouse_id") REFERENCES "warehouses"("organization_id","id");--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_adjustment_fk" FOREIGN KEY ("organization_id","adjustment_id") REFERENCES "stock_adjustments"("organization_id","id");--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_warehouse_fk" FOREIGN KEY ("organization_id","warehouse_id") REFERENCES "warehouses"("organization_id","id");--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_to_warehouse_fk" FOREIGN KEY ("organization_id","to_warehouse_id") REFERENCES "warehouses"("organization_id","id");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_fk" FOREIGN KEY ("organization_id","warehouse_id") REFERENCES "warehouses"("organization_id","id");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reverses_fk" FOREIGN KEY ("organization_id","reverses_movement_id") REFERENCES "stock_movements"("organization_id","id");--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invoice_sequences" DROP CONSTRAINT "invoice_sequences_type_check", ADD CONSTRAINT "invoice_sequences_type_check" CHECK ("document_type" in ('invoice', 'quotation', 'sales_order', 'credit_note', 'debit_note', 'payment', 'refund', 'purchase_order', 'purchase_bill', 'journal_entry', 'purchase_return', 'supplier_payment', 'stock_adjustment'));