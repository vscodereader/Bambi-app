ALTER TABLE "ad_product" ADD COLUMN "preview_template" "ad_preview_template" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "ad_product_id" uuid;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "exposure_amount" integer;--> statement-breakpoint
ALTER TABLE "job_post" ADD CONSTRAINT "job_post_ad_product_id_ad_product_id_fk" FOREIGN KEY ("ad_product_id") REFERENCES "public"."ad_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_placement" DROP COLUMN "preview_template";