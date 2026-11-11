CREATE TABLE "billing_messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"document_type" text NOT NULL,
	"document_id" text NOT NULL,
	"customer_id" text,
	"recipient" text NOT NULL,
	"subject" text,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"dedupe_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "billing_messages_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "billing_messages_channel_check" CHECK ("channel" in ('email', 'whatsapp')),
	CONSTRAINT "billing_messages_status_check" CHECK ("status" in ('sending', 'sent', 'failed', 'logged'))
);
--> statement-breakpoint
CREATE TABLE "document_shares" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"document_type" text NOT NULL,
	"document_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"views" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "document_shares_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "communication" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "send_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_messages_dedupe_uq" ON "billing_messages" ("organization_id","dedupe_key") WHERE "dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "billing_messages_document_idx" ON "billing_messages" ("organization_id","document_type","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_shares_token_uq" ON "document_shares" ("token_hash");--> statement-breakpoint
CREATE INDEX "document_shares_document_idx" ON "document_shares" ("organization_id","document_type","document_id");--> statement-breakpoint
ALTER TABLE "billing_messages" ADD CONSTRAINT "billing_messages_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "billing_messages" ADD CONSTRAINT "billing_messages_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "billing_messages" ADD CONSTRAINT "billing_messages_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "billing_messages" ADD CONSTRAINT "billing_messages_customer_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;