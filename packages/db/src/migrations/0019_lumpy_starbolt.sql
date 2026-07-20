ALTER TYPE "public"."job_post_media_usage" ADD VALUE 'ad_horizontal';--> statement-breakpoint
ALTER TYPE "public"."job_post_media_usage" ADD VALUE 'ad_vertical';--> statement-breakpoint
ALTER TABLE "job_post_media" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "job_post_media" ADD COLUMN "height" integer;