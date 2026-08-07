CREATE TYPE "public"."main_popup_audience" AS ENUM('common', 'job_seeker', 'employer');--> statement-breakpoint
CREATE TABLE "ad_product_discount_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_product_id" uuid NOT NULL,
	"price_option_days" integer NOT NULL,
	"discount_percent" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at_exclusive" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ad_product_discount_campaign_discount_check" CHECK ("ad_product_discount_campaign"."discount_percent" >= 0 AND "ad_product_discount_campaign"."discount_percent" <= 100),
	CONSTRAINT "ad_product_discount_campaign_days_check" CHECK ("ad_product_discount_campaign"."price_option_days" > 0),
	CONSTRAINT "ad_product_discount_campaign_window_check" CHECK ("ad_product_discount_campaign"."ends_at_exclusive" IS NULL OR "ad_product_discount_campaign"."ends_at_exclusive" > "ad_product_discount_campaign"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "community_post" ADD COLUMN "is_event" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "main_popup" ADD COLUMN "audience" "main_popup_audience" DEFAULT 'common' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_product_discount_campaign" ADD CONSTRAINT "ad_product_discount_campaign_ad_product_id_ad_product_id_fk" FOREIGN KEY ("ad_product_id") REFERENCES "public"."ad_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_product_discount_campaign" ADD CONSTRAINT "ad_product_discount_campaign_superseded_by_id_ad_product_discount_campaign_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."ad_product_discount_campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_product_discount_campaign" ADD CONSTRAINT "ad_product_discount_campaign_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_product_discount_campaign_product_days_idx" ON "ad_product_discount_campaign" USING btree ("ad_product_id","price_option_days","starts_at");