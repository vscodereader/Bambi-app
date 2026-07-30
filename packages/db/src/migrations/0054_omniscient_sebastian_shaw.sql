ALTER TYPE "public"."crawled_post_status" ADD VALUE 'removed';--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD COLUMN "removed_at" timestamp;