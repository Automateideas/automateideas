ALTER TABLE "customers" ADD COLUMN "customer_type" text DEFAULT 'business' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "contact_person" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "min_stock_qty" numeric(15,3);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "contact_person" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_account_name" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_account_number" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_ifsc" text;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_active_gstin_uq" ON "customers" ("organization_id","gstin") WHERE "gstin" is not null and "archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_uq" ON "products" ("organization_id","barcode") WHERE "barcode" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_active_gstin_uq" ON "suppliers" ("organization_id","gstin") WHERE "gstin" is not null and "archived_at" is null;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_fk" FOREIGN KEY ("organization_id","category_id") REFERENCES "product_categories"("organization_id","id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_type_check" CHECK ("customer_type" in ('individual', 'business'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_min_stock_check" CHECK ("min_stock_qty" is null or "min_stock_qty" >= 0);