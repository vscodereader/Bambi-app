CREATE TYPE "public"."ad_banner_animation" AS ENUM('blur-in', 'decrypt', 'typing', 'shiny', 'gradient');--> statement-breakpoint
CREATE TYPE "public"."ad_banner_theme" AS ENUM('dark', 'light', 'coral', 'none');--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "ad_inquiry_tel" text;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "ad_banner_headline" text;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "ad_banner_subline" text;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "ad_banner_vertical_text" text;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "ad_banner_animation" "ad_banner_animation";--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "ad_banner_theme" "ad_banner_theme";