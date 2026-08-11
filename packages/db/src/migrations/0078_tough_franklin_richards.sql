CREATE TYPE "public"."job_detail_design_status" AS ENUM('requested', 'completed');--> statement-breakpoint
ALTER TABLE "ad_product" ADD COLUMN "detail_design_price" integer;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "detail_design_amount" integer;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "detail_design_status" "job_detail_design_status";