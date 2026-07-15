ALTER TYPE "public"."community_board" ADD VALUE 'notice';--> statement-breakpoint
ALTER TABLE "community_comment" ADD COLUMN "author_role" "bambi_user_role" NOT NULL;--> statement-breakpoint
ALTER TABLE "community_post" ADD COLUMN "author_role" "bambi_user_role" NOT NULL;--> statement-breakpoint
ALTER TABLE "community_post" ADD COLUMN "is_promotion" boolean DEFAULT false NOT NULL;