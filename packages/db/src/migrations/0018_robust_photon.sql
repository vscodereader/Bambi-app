ALTER TABLE "job_post" ADD COLUMN "manual_boosts_per_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "job_post" SET "manual_boosts_per_day" = "ad_product"."manual_boosts_per_day" FROM "ad_product" WHERE "job_post"."ad_product_id" = "ad_product"."id";
