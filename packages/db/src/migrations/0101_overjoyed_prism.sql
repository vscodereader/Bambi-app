CREATE TABLE "job_ad_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"job_post_id" uuid NOT NULL,
	"ad_product_id" uuid,
	"duration_days" integer NOT NULL,
	"amount" integer NOT NULL,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_ad_purchase" ADD CONSTRAINT "job_ad_purchase_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_ad_purchase" ADD CONSTRAINT "job_ad_purchase_job_post_id_job_post_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_ad_purchase" ADD CONSTRAINT "job_ad_purchase_ad_product_id_ad_product_id_fk" FOREIGN KEY ("ad_product_id") REFERENCES "public"."ad_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_ad_purchase_organization_id_idx" ON "job_ad_purchase" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_ad_purchase_job_post_id_idx" ON "job_ad_purchase" USING btree ("job_post_id");--> statement-breakpoint
INSERT INTO "job_ad_purchase" ("organization_id", "job_post_id", "ad_product_id", "duration_days", "amount", "source", "created_at")
SELECT
	"organization_id",
	"id",
	"ad_product_id",
	COALESCE("exposure_duration_days", 0),
	COALESCE("exposure_amount", 0),
	'backfill',
	COALESCE("listing_paid_at", "published_at", "created_at")
FROM "job_post"
WHERE "payment_status" = 'paid' AND "ad_product_id" IS NOT NULL;
