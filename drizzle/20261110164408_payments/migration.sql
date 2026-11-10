ALTER TABLE "business_payments" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "business_payments_idempotency_uq" ON "business_payments" ("organization_id","idempotency_key") WHERE "idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_idempotency_uq" ON "refunds" ("organization_id","idempotency_key") WHERE "idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" ("organization_id","payment_id");--> statement-breakpoint
CREATE INDEX "refunds_credit_note_idx" ON "refunds" ("organization_id","credit_note_id");