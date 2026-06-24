CREATE TABLE "bambi_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"target_type" "moderation_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"chat_room_id" uuid,
	"read_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_read_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"chat_room_id" uuid NOT NULL,
	"reader_user_id" text NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD CONSTRAINT "bambi_notification_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD CONSTRAINT "bambi_notification_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD CONSTRAINT "bambi_notification_chat_room_id_chat_room_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_read_receipt" ADD CONSTRAINT "chat_message_read_receipt_message_id_chat_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_read_receipt" ADD CONSTRAINT "chat_message_read_receipt_chat_room_id_chat_room_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_read_receipt" ADD CONSTRAINT "chat_message_read_receipt_reader_user_id_user_id_fk" FOREIGN KEY ("reader_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bambi_notification_recipient_user_id_idx" ON "bambi_notification" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "bambi_notification_chat_room_id_idx" ON "bambi_notification" USING btree ("chat_room_id");--> statement-breakpoint
CREATE INDEX "bambi_notification_target_type_target_id_idx" ON "bambi_notification" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_read_receipt_message_id_reader_user_id_uidx" ON "chat_message_read_receipt" USING btree ("message_id","reader_user_id");--> statement-breakpoint
CREATE INDEX "chat_message_read_receipt_chat_room_id_idx" ON "chat_message_read_receipt" USING btree ("chat_room_id");--> statement-breakpoint
CREATE INDEX "chat_message_read_receipt_reader_user_id_idx" ON "chat_message_read_receipt" USING btree ("reader_user_id");