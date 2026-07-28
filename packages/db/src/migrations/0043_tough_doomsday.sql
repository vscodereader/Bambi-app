ALTER TYPE "public"."crawl_source_site" ADD VALUE 'queenalba';--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "crawl_source_site" "crawl_source_site" DEFAULT 'foxalba' NOT NULL;