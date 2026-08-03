CREATE TABLE "region" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sigungu" text,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
DROP INDEX "crawled_job_post_discovery_idx";--> statement-breakpoint
DROP INDEX "job_post_discovery_idx";--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD COLUMN "region_code" varchar(10);--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD COLUMN "district_code" varchar(10);--> statement-breakpoint
ALTER TABLE "employer_team_profile" ADD COLUMN "region_code" varchar(10);--> statement-breakpoint
ALTER TABLE "employer_team_profile" ADD COLUMN "district_code" varchar(10);--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "region_code" varchar(10);--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "district_code" varchar(10);--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD CONSTRAINT "crawled_job_post_region_code_region_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."region"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD CONSTRAINT "crawled_job_post_district_code_region_code_fk" FOREIGN KEY ("district_code") REFERENCES "public"."region"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_team_profile" ADD CONSTRAINT "employer_team_profile_region_code_region_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."region"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_team_profile" ADD CONSTRAINT "employer_team_profile_district_code_region_code_fk" FOREIGN KEY ("district_code") REFERENCES "public"."region"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_post" ADD CONSTRAINT "job_post_region_code_region_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."region"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_post" ADD CONSTRAINT "job_post_district_code_region_code_fk" FOREIGN KEY ("district_code") REFERENCES "public"."region"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawled_job_post_discovery_idx" ON "crawled_job_post" USING btree ("status","industry_category","region_code");--> statement-breakpoint
CREATE INDEX "job_post_discovery_idx" ON "job_post" USING btree ("status","industry_category","region_code","pay_amount");