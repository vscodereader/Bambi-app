CREATE TYPE "public"."promotion_status" AS ENUM('draft', 'pending_payment', 'active', 'paused', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."promotion_tier" AS ENUM('premium', 'recommended', 'standard');--> statement-breakpoint
CREATE TABLE "job_promotion_boost_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"job_post_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"boost_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_promotion_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"tier" "promotion_tier" NOT NULL,
	"status" "promotion_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"manual_boosts_total" integer DEFAULT 0 NOT NULL,
	"manual_boosts_used" integer DEFAULT 0 NOT NULL,
	"auto_boosts_per_day" integer DEFAULT 0 NOT NULL,
	"last_boosted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_promotion_boost_event" ADD CONSTRAINT "job_promotion_boost_event_campaign_id_job_promotion_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."job_promotion_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_promotion_boost_event" ADD CONSTRAINT "job_promotion_boost_event_job_post_id_job_post_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_promotion_boost_event" ADD CONSTRAINT "job_promotion_boost_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_promotion_boost_event" ADD CONSTRAINT "job_promotion_boost_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_promotion_campaign" ADD CONSTRAINT "job_promotion_campaign_job_post_id_job_post_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_promotion_campaign" ADD CONSTRAINT "job_promotion_campaign_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_promotion_boost_event_campaign_id_idx" ON "job_promotion_boost_event" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "job_promotion_boost_event_job_post_id_idx" ON "job_promotion_boost_event" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX "job_promotion_boost_event_organization_id_idx" ON "job_promotion_boost_event" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_promotion_campaign_job_post_id_idx" ON "job_promotion_campaign" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX "job_promotion_campaign_organization_id_idx" ON "job_promotion_campaign" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_promotion_campaign_status_idx" ON "job_promotion_campaign" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_promotion_campaign_active_listing_idx" ON "job_promotion_campaign" USING btree ("status","tier","ends_at","last_boosted_at");