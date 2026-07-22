ALTER TABLE "user" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "purged_at" timestamp;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "withdrawal_retention_days" integer;