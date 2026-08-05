ALTER TABLE "bambi_site_settings" ADD COLUMN "withdrawal_purge_hour" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "withdrawal_purge_last_run_at" timestamp;