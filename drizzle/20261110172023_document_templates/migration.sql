ALTER TABLE "billing_settings" ADD COLUMN "document_template" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "signature_key" text;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "stamp_key" text;