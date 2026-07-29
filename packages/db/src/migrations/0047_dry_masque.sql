ALTER TABLE "bambi_site_settings" ALTER COLUMN "crawl_source_site" SET DEFAULT 'queenalba';--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "minimum_wage_year" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "minimum_wage_hourly" integer;--> statement-breakpoint
ALTER TABLE "crawl_run" ADD COLUMN "content_type" "crawl_content_type" DEFAULT 'job_post' NOT NULL;--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD COLUMN "listing_type" text;--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD COLUMN "banner_image_url" text;--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD COLUMN "detail_image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;