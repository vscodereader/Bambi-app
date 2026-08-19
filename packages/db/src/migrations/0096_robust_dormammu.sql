ALTER TYPE "public"."notification_target_type" ADD VALUE IF NOT EXISTS 'point_transaction';--> statement-breakpoint
ALTER TABLE "bambi_point_transaction" ADD COLUMN IF NOT EXISTS "actor_user_id" text;--> statement-breakpoint
ALTER TABLE "bambi_point_transaction" ADD COLUMN IF NOT EXISTS "balance_after" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_transaction" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "bambi_point_transaction" ADD COLUMN IF NOT EXISTS "external_key" text;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN IF NOT EXISTS "signup_points" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN IF NOT EXISTS "attendance_points" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN IF NOT EXISTS "job_payment_min_points" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN IF NOT EXISTS "job_payment_max_points" integer;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN IF NOT EXISTS "points_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN IF NOT EXISTS "points_used_by_user_id" text;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN IF NOT EXISTS "points_refunded_at" timestamp;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN IF NOT EXISTS "points_refund_locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN IF NOT EXISTS "submission_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bambi_point_transaction" ADD CONSTRAINT "bambi_point_transaction_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "job_post" ADD CONSTRAINT "job_post_points_used_by_user_id_user_id_fk" FOREIGN KEY ("points_used_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bambi_point_transaction_external_key_uidx" ON "bambi_point_transaction" USING btree ("external_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_post_creator_submission_key_uidx" ON "job_post" USING btree ("created_by_user_id","submission_key");--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bambi_site_settings" ADD CONSTRAINT "bambi_site_settings_point_values_check" CHECK ("signup_points" >= 0 AND "attendance_points" >= 0 AND ("job_payment_min_points" IS NULL OR "job_payment_min_points" >= 0) AND ("job_payment_max_points" IS NULL OR "job_payment_max_points" >= 0) AND ("job_payment_min_points" IS NULL OR "job_payment_min_points" = 0 OR "job_payment_max_points" IS NULL OR "job_payment_max_points" >= "job_payment_min_points"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "job_post" ADD CONSTRAINT "job_post_points_used_check" CHECK ("points_used" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
