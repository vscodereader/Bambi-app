ALTER TYPE "public"."moderation_target_type" ADD VALUE IF NOT EXISTS 'team_invitation';--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "rejection_reason" text;
