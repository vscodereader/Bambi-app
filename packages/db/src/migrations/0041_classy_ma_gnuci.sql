CREATE TABLE "job_ad_banner_layout" (
	"job_post_id" uuid PRIMARY KEY NOT NULL,
	"layout" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_ad_banner_layout" ADD CONSTRAINT "job_ad_banner_layout_job_post_id_job_post_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_post" DROP COLUMN "ad_banner_headline";--> statement-breakpoint
ALTER TABLE "job_post" DROP COLUMN "ad_banner_subline";--> statement-breakpoint
ALTER TABLE "job_post" DROP COLUMN "ad_banner_vertical_text";--> statement-breakpoint
ALTER TABLE "job_post" DROP COLUMN "ad_banner_animation";--> statement-breakpoint
ALTER TABLE "job_post" DROP COLUMN "ad_banner_theme";--> statement-breakpoint
DROP TYPE "public"."ad_banner_animation";--> statement-breakpoint
DROP TYPE "public"."ad_banner_theme";