ALTER TYPE "public"."moderation_target_type" ADD VALUE 'team_invitation';--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "rejection_reason" text;