ALTER TYPE "public"."bambi_user_role" ADD VALUE 'legal_advisor';--> statement-breakpoint
ALTER TYPE "public"."community_board" ADD VALUE 'legal';--> statement-breakpoint
ALTER TABLE "community_post" ADD COLUMN "contact_phone" text;