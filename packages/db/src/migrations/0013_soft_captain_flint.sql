ALTER TABLE "community_post" ADD COLUMN "author_display_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "community_post" ADD COLUMN "password_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "community_post" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;