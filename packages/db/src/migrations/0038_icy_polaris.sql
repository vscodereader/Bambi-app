ALTER TABLE "chat_message" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "chat_room" ADD COLUMN "seeker_deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_room" ADD COLUMN "employer_deleted_at" timestamp;