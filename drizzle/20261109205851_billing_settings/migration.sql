CREATE TABLE "billing_settings" (
	"organization_id" text PRIMARY KEY,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"gstin" text,
	"pan" text,
	"email" text,
	"phone" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country_code" text DEFAULT 'IN' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"financial_year_start_month" integer DEFAULT 4 NOT NULL,
	"invoice_prefix" text DEFAULT 'INV-' NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_settings_fy_month_check" CHECK ("financial_year_start_month" between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;