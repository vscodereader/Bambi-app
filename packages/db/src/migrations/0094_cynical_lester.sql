CREATE TYPE "public"."support_chat_sender" AS ENUM('inquirer', 'admin');--> statement-breakpoint
ALTER TYPE "public"."notification_target_type" ADD VALUE 'support_chat';--> statement-breakpoint
CREATE TABLE "support_chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"sender_type" "support_chat_sender" NOT NULL,
	"sender_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_chat_room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"guest_id" text,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"user_last_read_at" timestamp,
	"admin_last_read_at" timestamp,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "support_chat_room_owner_one_of_ck" CHECK (("support_chat_room"."user_id" IS NULL) <> ("support_chat_room"."guest_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "bambi_notification" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD CONSTRAINT "support_chat_message_room_id_support_chat_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."support_chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD CONSTRAINT "support_chat_message_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_chat_room" ADD CONSTRAINT "support_chat_room_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_chat_message_room_id_created_at_idx" ON "support_chat_message" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_chat_room_user_id_uidx" ON "support_chat_room" USING btree ("user_id") WHERE "support_chat_room"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "support_chat_room_guest_id_uidx" ON "support_chat_room" USING btree ("guest_id") WHERE "support_chat_room"."guest_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "support_chat_room_last_message_at_idx" ON "support_chat_room" USING btree ("last_message_at");