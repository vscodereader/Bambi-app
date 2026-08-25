DROP INDEX "bambi_point_job_daily_selection_date_category_uidx";--> statement-breakpoint
ALTER TABLE "bambi_point_job_reward" ADD COLUMN "cooldown_until" timestamp;--> statement-breakpoint
UPDATE "bambi_point_job_reward"
SET "cooldown_until" = "rewarded_at" + interval '24 hours';--> statement-breakpoint
ALTER TABLE "bambi_point_job_reward" ALTER COLUMN "cooldown_until" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "premium_point_job_reward_points" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "special_point_job_reward_points" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "recommended_point_job_reward_points" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "premium_point_job_rotation_hours" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "special_point_job_rotation_hours" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "recommended_point_job_rotation_hours" integer;--> statement-breakpoint
UPDATE "bambi_site_settings"
SET
	"premium_point_job_reward_points" = "point_job_reward_points",
	"special_point_job_reward_points" = "point_job_reward_points",
	"recommended_point_job_reward_points" = "point_job_reward_points",
	"premium_point_job_rotation_hours" = 24,
	"special_point_job_rotation_hours" = 24,
	"recommended_point_job_rotation_hours" = 24;--> statement-breakpoint
CREATE INDEX "bambi_point_job_daily_selection_category_selected_idx" ON "bambi_point_job_daily_selection" USING btree ("category","selected_at");
