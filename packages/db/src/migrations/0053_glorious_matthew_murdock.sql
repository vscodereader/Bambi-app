ALTER TABLE "bambi_site_settings" ADD COLUMN "crawled_community_feed_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD COLUMN "comments" jsonb;