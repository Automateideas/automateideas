ALTER TABLE "organization" ADD COLUMN "plan_id" text DEFAULT 'starter' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_cycle" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "current_period_end" timestamp;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_payment" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "subscription_payment" ADD COLUMN "billing_cycle" text;