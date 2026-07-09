CREATE TYPE "public"."ad_placement_kind" AS ENUM('listing', 'banner');--> statement-breakpoint
CREATE TYPE "public"."ad_preview_template" AS ENUM('premium-top', 'special-list', 'urgent-list', 'recommended-list', 'side-vertical', 'side-horizontal', 'none');--> statement-breakpoint
CREATE TYPE "public"."job_exposure_type" AS ENUM('premium-banner', 'left-banner', 'right-banner', 'special', 'urgent', 'recommended', 'standard');--> statement-breakpoint
CREATE TYPE "public"."job_payment_method" AS ENUM('card', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."job_payment_status" AS ENUM('unpaid', 'paid');--> statement-breakpoint
CREATE TABLE "ad_placement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "ad_placement_kind" DEFAULT 'listing' NOT NULL,
	"preview_template" "ad_preview_template" DEFAULT 'none' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"placement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "exposure_type" "job_exposure_type" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "exposure_duration_days" integer;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "payment_method" "job_payment_method";--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "payment_status" "job_payment_status" DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "exposure_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "ad_product" ADD CONSTRAINT "ad_product_placement_id_ad_placement_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."ad_placement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_placement_active_sort_idx" ON "ad_placement" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "ad_product_placement_idx" ON "ad_product" USING btree ("placement_id","is_active","sort_order");