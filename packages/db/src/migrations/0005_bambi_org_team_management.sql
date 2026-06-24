ALTER TABLE "invitation" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "accepted_user_id" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "invited_email" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "accepted_user_id" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "member" SET "accepted_user_id" = "user_id", "updated_at" = "created_at" WHERE "accepted_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_accepted_user_id_user_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_accepted_user_id_user_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_status_idx" ON "invitation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "member_status_idx" ON "member" USING btree ("status");--> statement-breakpoint
CREATE INDEX "member_invitedEmail_idx" ON "member" USING btree ("invited_email");
