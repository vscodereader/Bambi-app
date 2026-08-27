ALTER TYPE "public"."notification_target_type" ADD VALUE 'direct_message';--> statement-breakpoint
CREATE TABLE "bambi_direct_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_user_id" text,
	"target_roles" text[] DEFAULT '{}' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bambi_direct_message_recipient" (
	"message_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"read_at" timestamp,
	"archived_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bambi_direct_message_recipient_message_id_recipient_user_id_pk" PRIMARY KEY("message_id","recipient_user_id")
);
--> statement-breakpoint
ALTER TABLE "bambi_direct_message" ADD CONSTRAINT "bambi_direct_message_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_direct_message_recipient" ADD CONSTRAINT "bambi_direct_message_recipient_message_id_bambi_direct_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."bambi_direct_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_direct_message_recipient" ADD CONSTRAINT "bambi_direct_message_recipient_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bambi_dm_recipient_user_idx" ON "bambi_direct_message_recipient" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "bambi_dm_recipient_unread_idx" ON "bambi_direct_message_recipient" USING btree ("recipient_user_id") WHERE "bambi_direct_message_recipient"."read_at" IS NULL AND "bambi_direct_message_recipient"."deleted_at" IS NULL;