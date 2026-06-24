CREATE TYPE "public"."chat_attachment_category" AS ENUM('image', 'pdf');--> statement-breakpoint
CREATE TABLE "chat_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_room_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"category" "chat_attachment_category" NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD CONSTRAINT "chat_attachment_chat_room_id_chat_room_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD CONSTRAINT "chat_attachment_message_id_chat_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD CONSTRAINT "chat_attachment_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_attachment_chat_room_id_idx" ON "chat_attachment" USING btree ("chat_room_id");--> statement-breakpoint
CREATE INDEX "chat_attachment_message_id_idx" ON "chat_attachment" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_attachment_storage_key_uidx" ON "chat_attachment" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "chat_attachment_created_by_user_id_idx" ON "chat_attachment" USING btree ("created_by_user_id");