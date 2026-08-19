CREATE TYPE "public"."point_shop_audience" AS ENUM('all', 'employer', 'job_seeker');--> statement-breakpoint
CREATE TYPE "public"."point_shop_benefit_type" AS ENUM('none', 'coupon', 'boost_manual_period', 'boost_manual_count', 'boost_auto_period', 'ad_extend');--> statement-breakpoint
ALTER TYPE "public"."job_boost_purchase_source" ADD VALUE 'point_shop';--> statement-breakpoint
ALTER TYPE "public"."notification_target_type" ADD VALUE 'point_shop_order';--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD COLUMN "benefit_type" "point_shop_benefit_type" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD COLUMN "audience" "point_shop_audience" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD COLUMN "boosts_per_day" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD COLUMN "duration_days" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD COLUMN "boost_count" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD COLUMN "extend_days" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD COLUMN "usage_limit_days" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD COLUMN "stock_quantity" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD COLUMN "benefit_type" "point_shop_benefit_type" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD COLUMN "boosts_per_day" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD COLUMN "duration_days" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD COLUMN "boost_count" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD COLUMN "extend_days" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD COLUMN "usable_until" timestamp;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD COLUMN "used_at" timestamp;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD COLUMN "target_job_post_id" uuid;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD COLUMN "expiry_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD CONSTRAINT "bambi_point_shop_order_target_job_post_id_job_post_id_fk" FOREIGN KEY ("target_job_post_id") REFERENCES "public"."job_post"("id") ON DELETE set null ON UPDATE no action;