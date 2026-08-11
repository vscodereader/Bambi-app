ALTER TABLE "bambi_site_settings" ADD COLUMN "urgent_section_hidden" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "special_capacity" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "recommended_capacity" integer;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "best_board_icon" text;