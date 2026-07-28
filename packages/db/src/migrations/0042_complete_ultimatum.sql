CREATE TYPE "public"."crawl_run_status" AS ENUM('running', 'success', 'failed', 'aborted_low_yield');--> statement-breakpoint
CREATE TYPE "public"."crawl_source_site" AS ENUM('foxalba');--> statement-breakpoint
CREATE TYPE "public"."crawled_post_status" AS ENUM('active', 'needs_review', 'expired');--> statement-breakpoint
CREATE TYPE "public"."job_post_source" AS ENUM('original', 'converted');--> statement-breakpoint
CREATE TABLE "crawl_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_site" "crawl_source_site" NOT NULL,
	"status" "crawl_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"items_seen" integer DEFAULT 0 NOT NULL,
	"items_new" integer DEFAULT 0 NOT NULL,
	"items_updated" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "crawled_community_topic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_site" "crawl_source_site" NOT NULL,
	"source_external_id" text NOT NULL,
	"source_url" text NOT NULL,
	"board_name" text,
	"title" text NOT NULL,
	"view_count" integer,
	"comment_count" integer,
	"source_posted_at" timestamp,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawled_job_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_site" "crawl_source_site" NOT NULL,
	"source_external_id" text NOT NULL,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"shop_name" text,
	"body" text NOT NULL,
	"region" text,
	"district" text,
	"industry_raw" text,
	"industry_category" "job_industry_category",
	"pay_raw" text,
	"pay_amount" integer,
	"pay_unit" text,
	"work_schedule" text,
	"gender" text,
	"age_range" text,
	"contact_name" text,
	"contact_phone" text,
	"contact_kakao" text,
	"biz_name" text,
	"address" text,
	"content_hash" text NOT NULL,
	"status" "crawled_post_status" DEFAULT 'active' NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"detail_fetched_at" timestamp,
	"source_posted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "crawl_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "crawl_interval_hours" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "crawl_last_run_at" timestamp;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "source" "job_post_source" DEFAULT 'original' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "crawled_from_id" uuid;--> statement-breakpoint
CREATE INDEX "crawl_run_source_site_started_at_idx" ON "crawl_run" USING btree ("source_site","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crawl_run_active_source_site_uidx" ON "crawl_run" USING btree ("source_site") WHERE "crawl_run"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "crawled_community_topic_source_uidx" ON "crawled_community_topic" USING btree ("source_site","source_external_id");--> statement-breakpoint
CREATE INDEX "crawled_community_topic_seen_idx" ON "crawled_community_topic" USING btree ("source_site","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crawled_job_post_source_uidx" ON "crawled_job_post" USING btree ("source_site","source_external_id");--> statement-breakpoint
CREATE INDEX "crawled_job_post_status_last_seen_at_idx" ON "crawled_job_post" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE INDEX "crawled_job_post_discovery_idx" ON "crawled_job_post" USING btree ("status","industry_category","region");--> statement-breakpoint
ALTER TABLE "job_post" ADD CONSTRAINT "job_post_crawled_from_id_crawled_job_post_id_fk" FOREIGN KEY ("crawled_from_id") REFERENCES "public"."crawled_job_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_post_crawled_from_id_uidx" ON "job_post" USING btree ("crawled_from_id");