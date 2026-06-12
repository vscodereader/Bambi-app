CREATE TYPE "public"."account_status" AS ENUM('active', 'warned', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."bambi_user_role" AS ENUM('job_seeker', 'employer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."employer_verification_status" AS ENUM('none', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('proposed', 'confirmed', 'declined', 'canceled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."job_post_status" AS ENUM('draft', 'pending_review', 'published', 'hidden', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."moderation_target_type" AS ENUM('job_post', 'chat_room', 'chat_message', 'review', 'user');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"team_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"active_team_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_moderation_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" text NOT NULL,
	"target_type" "moderation_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bambi_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" "bambi_user_role" NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"is_phone_verified" boolean DEFAULT false NOT NULL,
	"phone_number" text,
	"display_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_room_id" uuid NOT NULL,
	"sender_user_id" text NOT NULL,
	"body" text NOT NULL,
	"risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" text,
	"employer_user_id" text NOT NULL,
	"job_seeker_user_id" text NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_reveal_consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_schedule_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"contact_method" text NOT NULL,
	"contact_value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employer_organization_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"display_name" text NOT NULL,
	"business_registration_number" text,
	"verification_status" "employer_verification_status" DEFAULT 'none' NOT NULL,
	"verification_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employer_team_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" text NOT NULL,
	"display_name" text NOT NULL,
	"region" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_room_id" uuid NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"status" "interview_status" DEFAULT 'proposed' NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"location_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" text,
	"created_by_user_id" text NOT NULL,
	"status" "job_post_status" DEFAULT 'pending_review' NOT NULL,
	"industry_category" text NOT NULL,
	"region" text NOT NULL,
	"pay_amount" integer NOT NULL,
	"pay_unit" text NOT NULL,
	"work_schedule" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"interview_notes" text,
	"rejection_reason" text,
	"risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" text NOT NULL,
	"target_type" "moderation_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_schedule_id" uuid NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"chat_room_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_moderation_action" ADD CONSTRAINT "admin_moderation_action_admin_user_id_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_profile" ADD CONSTRAINT "bambi_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_chat_room_id_chat_room_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_job_post_id_job_post_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_employer_user_id_user_id_fk" FOREIGN KEY ("employer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_job_seeker_user_id_user_id_fk" FOREIGN KEY ("job_seeker_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveal_consent" ADD CONSTRAINT "contact_reveal_consent_interview_schedule_id_interview_schedule_id_fk" FOREIGN KEY ("interview_schedule_id") REFERENCES "public"."interview_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveal_consent" ADD CONSTRAINT "contact_reveal_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_schedule" ADD CONSTRAINT "interview_schedule_chat_room_id_chat_room_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_schedule" ADD CONSTRAINT "interview_schedule_proposed_by_user_id_user_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_post" ADD CONSTRAINT "job_post_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_interview_schedule_id_interview_schedule_id_fk" FOREIGN KEY ("interview_schedule_id") REFERENCES "public"."interview_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocker_user_id_user_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocked_user_id_user_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_chat_room_id_chat_room_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "admin_moderation_action_target_type_target_id_idx" ON "admin_moderation_action" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "bambi_profile_role_idx" ON "bambi_profile" USING btree ("role");--> statement-breakpoint
CREATE INDEX "bambi_profile_status_idx" ON "bambi_profile" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chat_message_chat_room_id_idx" ON "chat_message" USING btree ("chat_room_id");--> statement-breakpoint
CREATE INDEX "chat_message_sender_user_id_idx" ON "chat_message" USING btree ("sender_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_room_job_post_id_job_seeker_user_id_uidx" ON "chat_room" USING btree ("job_post_id","job_seeker_user_id");--> statement-breakpoint
CREATE INDEX "chat_room_organization_id_idx" ON "chat_room" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_room_team_id_idx" ON "chat_room" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "chat_room_employer_user_id_idx" ON "chat_room" USING btree ("employer_user_id");--> statement-breakpoint
CREATE INDEX "chat_room_job_seeker_user_id_idx" ON "chat_room" USING btree ("job_seeker_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_reveal_consent_schedule_id_user_id_method_uidx" ON "contact_reveal_consent" USING btree ("interview_schedule_id","user_id","contact_method");--> statement-breakpoint
CREATE UNIQUE INDEX "employer_organization_profile_organization_id_uidx" ON "employer_organization_profile" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "employer_organization_profile_verification_status_idx" ON "employer_organization_profile" USING btree ("verification_status");--> statement-breakpoint
CREATE UNIQUE INDEX "employer_team_profile_team_id_uidx" ON "employer_team_profile" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "employer_team_profile_organization_id_idx" ON "employer_team_profile" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_schedule_chat_room_id_idx" ON "interview_schedule" USING btree ("chat_room_id");--> statement-breakpoint
CREATE INDEX "interview_schedule_status_idx" ON "interview_schedule" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_post_organization_id_idx" ON "job_post" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_post_team_id_idx" ON "job_post" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "job_post_created_by_user_id_idx" ON "job_post" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "job_post_status_idx" ON "job_post" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_post_discovery_idx" ON "job_post" USING btree ("status","industry_category","region","pay_amount");--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "report" USING btree ("status");--> statement-breakpoint
CREATE INDEX "report_target_type_target_id_idx" ON "report" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_interview_schedule_id_reviewer_user_id_uidx" ON "review" USING btree ("interview_schedule_id","reviewer_user_id");--> statement-breakpoint
CREATE INDEX "review_target_user_id_idx" ON "review" USING btree ("target_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_block_blocker_user_id_blocked_user_id_uidx" ON "user_block" USING btree ("blocker_user_id","blocked_user_id");