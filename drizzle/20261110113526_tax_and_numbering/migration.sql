ALTER TABLE "billing_settings" ADD COLUMN "state_code" text;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "prices_include_tax" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "round_off" text DEFAULT 'nearest_rupee' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "document_numbering" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tax_category" text DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cess_rate" numeric(7,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "tax_category" text DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_round_off_check" CHECK ("round_off" in ('nearest_rupee', 'none'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cess_rate_check" CHECK ("cess_rate" between 0 and 400);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tax_category_check" CHECK ("tax_category" in ('taxable', 'exempt', 'nil_rated', 'non_gst'));--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_tax_category_check" CHECK ("tax_category" in ('taxable', 'exempt', 'nil_rated', 'non_gst'));