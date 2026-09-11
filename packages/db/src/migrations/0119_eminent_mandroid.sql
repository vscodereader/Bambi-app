ALTER TABLE "job_view_log" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "job_view_log" ADD COLUMN "business_key" text;--> statement-breakpoint
ALTER TABLE "job_view_log" ADD COLUMN "business_phone" text;--> statement-breakpoint
UPDATE "job_view_log" SET "source" = 'member', "business_key" = 'org:' || "organization_id";--> statement-breakpoint
ALTER TABLE "job_view_log" ALTER COLUMN "source" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "job_view_log" ALTER COLUMN "business_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "job_view_log" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "job_view_log_user_business_idx" ON "job_view_log" USING btree ("user_id","business_key");
