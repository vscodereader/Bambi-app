CREATE TYPE "public"."notification_target_type" AS ENUM('chat_message', 'chat_room', 'interview_schedule', 'contact_reveal', 'support_inquiry', 'report', 'community_post', 'community_comment', 'review', 'job_post', 'employer_verification', 'team_invitation', 'organization_member');--> statement-breakpoint
CREATE TABLE "bambi_attendance" (
	"user_id" text NOT NULL,
	"attended_on" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bambi_attendance_user_id_attended_on_pk" PRIMARY KEY("user_id","attended_on")
);
--> statement-breakpoint
CREATE TABLE "bambi_point_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bambi_notification" ALTER COLUMN "recipient_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_notification" ALTER COLUMN "target_type" SET DATA TYPE "public"."notification_target_type" USING "target_type"::text::"public"."notification_target_type";--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD COLUMN "recipient_role" "bambi_user_role";--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD COLUMN "read_by_user_id" text;--> statement-breakpoint
ALTER TABLE "bambi_attendance" ADD CONSTRAINT "bambi_attendance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_point_transaction" ADD CONSTRAINT "bambi_point_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bambi_attendance_attended_on_idx" ON "bambi_attendance" USING btree ("attended_on");--> statement-breakpoint
CREATE INDEX "bambi_point_transaction_user_id_idx" ON "bambi_point_transaction" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD CONSTRAINT "bambi_notification_read_by_user_id_user_id_fk" FOREIGN KEY ("read_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bambi_notification_recipient_role_idx" ON "bambi_notification" USING btree ("recipient_role") WHERE "bambi_notification"."recipient_role" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD CONSTRAINT "bambi_notification_recipient_one_of_ck" CHECK (num_nonnulls("bambi_notification"."recipient_user_id", "bambi_notification"."recipient_role") = 1);