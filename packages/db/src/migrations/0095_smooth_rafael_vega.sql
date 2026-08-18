CREATE TYPE "public"."support_chat_room_status" AS ENUM('open', 'closed');--> statement-breakpoint
DROP INDEX "support_chat_room_user_id_uidx";--> statement-breakpoint
DROP INDEX "support_chat_room_guest_id_uidx";--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "support_chat_notice" text;--> statement-breakpoint
ALTER TABLE "support_chat_room" ADD COLUMN "status" "support_chat_room_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_chat_room" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
CREATE INDEX "support_chat_room_user_id_idx" ON "support_chat_room" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "support_chat_room_guest_id_idx" ON "support_chat_room" USING btree ("guest_id","last_message_at");