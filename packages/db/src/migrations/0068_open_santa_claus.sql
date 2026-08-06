CREATE INDEX "chat_message_chat_room_id_created_at_idx" ON "chat_message" USING btree ("chat_room_id","created_at");--> statement-breakpoint
DROP INDEX "chat_message_chat_room_id_idx";--> statement-breakpoint
CREATE INDEX "report_reporter_user_id_status_idx" ON "report" USING btree ("reporter_user_id","status");