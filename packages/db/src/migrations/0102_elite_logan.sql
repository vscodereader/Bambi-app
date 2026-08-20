CREATE TYPE "public"."bambi_ad_period_tier_icon" AS ENUM('medal', 'crown');--> statement-breakpoint
CREATE TABLE "bambi_ad_period_tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"icon" "bambi_ad_period_tier_icon" NOT NULL,
	"color_class" text NOT NULL,
	"min_days" integer NOT NULL,
	"max_days" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
