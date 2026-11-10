ALTER TABLE "billing_settings" DROP CONSTRAINT "billing_settings_logo_fk";--> statement-breakpoint
ALTER TABLE "billing_files" DROP CONSTRAINT "billing_files_org_id_uq";--> statement-breakpoint
ALTER TABLE "billing_settings" DROP COLUMN "logo_file_id";