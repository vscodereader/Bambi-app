CREATE TYPE "public"."ad_placement_kind" AS ENUM('listing', 'banner');--> statement-breakpoint
CREATE TABLE "ad_placement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "ad_placement_kind" DEFAULT 'listing' NOT NULL,
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
ALTER TABLE "ad_product" ADD CONSTRAINT "ad_product_placement_id_ad_placement_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."ad_placement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_placement_active_sort_idx" ON "ad_placement" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "ad_product_placement_idx" ON "ad_product" USING btree ("placement_id","is_active","sort_order");