CREATE TABLE "subscription_payment" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"provider" text DEFAULT 'payu' NOT NULL,
	"txnid" text NOT NULL UNIQUE,
	"provider_payment_id" text,
	"status" text NOT NULL,
	"seats" integer NOT NULL,
	"amount_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"description" text,
	"payment_mode" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "subscription_payment_org_created_idx" ON "subscription_payment" ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;