ALTER TABLE "main_popup" ADD COLUMN "target_pages" jsonb DEFAULT '["main"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "target_snapshot" jsonb;