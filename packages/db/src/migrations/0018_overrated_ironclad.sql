ALTER TABLE "job_boost_event" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_product" ADD COLUMN "auto_boosts_per_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "auto_boosts_per_day" integer DEFAULT 0 NOT NULL;