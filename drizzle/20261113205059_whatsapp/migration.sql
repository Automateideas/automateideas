CREATE TABLE "whatsapp_connections" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"business_id" text,
	"display_phone_number" text,
	"verified_name" text,
	"token_encrypted" text NOT NULL,
	"pin_encrypted" text,
	"status" text NOT NULL,
	"templates" jsonb DEFAULT '{}' NOT NULL,
	"last_error" text,
	"connected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "whatsapp_connections_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "whatsapp_connections_status_check" CHECK ("status" in ('connected', 'error', 'disconnected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_connections_org_uq" ON "whatsapp_connections" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_connections_phone_uq" ON "whatsapp_connections" ("phone_number_id");--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "billing_messages" DROP CONSTRAINT "billing_messages_status_check", ADD CONSTRAINT "billing_messages_status_check" CHECK ("status" in ('sending', 'sent', 'delivered', 'read', 'failed', 'logged'));