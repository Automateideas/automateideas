CREATE TABLE "recurring_invoice_runs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"recurring_invoice_id" text NOT NULL,
	"run_date" date NOT NULL,
	"invoice_id" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "recurring_invoice_runs_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "recurring_invoice_runs_date_uq" UNIQUE("organization_id","recurring_invoice_id","run_date"),
	CONSTRAINT "recurring_invoice_runs_status_check" CHECK ("status" in ('created', 'issued', 'emailed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "recurring_invoices" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"customer_id" text NOT NULL,
	"template" jsonb NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"frequency" text NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"max_count" integer,
	"next_run_date" date,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"last_run_date" date,
	"due_days" integer,
	"auto_issue" boolean DEFAULT true NOT NULL,
	"auto_email" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source_invoice_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "recurring_invoices_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "recurring_invoices_frequency_check" CHECK ("frequency" in ('weekly', 'monthly', 'quarterly', 'yearly')),
	CONSTRAINT "recurring_invoices_status_check" CHECK ("status" in ('active', 'paused', 'ended')),
	CONSTRAINT "recurring_invoices_interval_check" CHECK ("interval" between 1 and 52),
	CONSTRAINT "recurring_invoices_end_check" CHECK ("end_date" is null or "end_date" >= "start_date"),
	CONSTRAINT "recurring_invoices_max_check" CHECK ("max_count" is null or "max_count" >= 1),
	CONSTRAINT "recurring_invoices_due_check" CHECK ("due_days" is null or "due_days" between 0 and 365)
);
--> statement-breakpoint
ALTER TABLE "business_invoices" ADD COLUMN "recurring_invoice_id" text;--> statement-breakpoint
CREATE INDEX "business_invoices_recurring_idx" ON "business_invoices" ("organization_id","recurring_invoice_id");--> statement-breakpoint
CREATE INDEX "recurring_invoices_next_idx" ON "recurring_invoices" ("organization_id","status","next_run_date");--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_recurring_fk" FOREIGN KEY ("organization_id","recurring_invoice_id") REFERENCES "recurring_invoices"("organization_id","id");--> statement-breakpoint
ALTER TABLE "recurring_invoice_runs" ADD CONSTRAINT "recurring_invoice_runs_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "recurring_invoice_runs" ADD CONSTRAINT "recurring_invoice_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoice_runs" ADD CONSTRAINT "recurring_invoice_runs_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoice_runs" ADD CONSTRAINT "recurring_invoice_runs_profile_fk" FOREIGN KEY ("organization_id","recurring_invoice_id") REFERENCES "recurring_invoices"("organization_id","id");--> statement-breakpoint
ALTER TABLE "recurring_invoice_runs" ADD CONSTRAINT "recurring_invoice_runs_invoice_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "business_invoices"("organization_id","id");--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_customer_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");