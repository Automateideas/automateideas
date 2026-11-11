ALTER TABLE "accounts" ADD COLUMN "system_key" text;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "books_locked_until" date;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_system_key_uq" ON "accounts" ("organization_id","system_key") WHERE "system_key" is not null;