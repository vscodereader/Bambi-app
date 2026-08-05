ALTER TYPE "public"."bambi_user_role" ADD VALUE 'guest';--> statement-breakpoint
ALTER TABLE "community_comment" ALTER COLUMN "author_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "community_post" ALTER COLUMN "author_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "community_post_like" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "community_comment" ADD COLUMN "author_guest_id" text;--> statement-breakpoint
ALTER TABLE "community_comment" ADD COLUMN "password_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "community_post" ADD COLUMN "author_guest_id" text;--> statement-breakpoint
ALTER TABLE "community_post_like" ADD COLUMN "guest_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "community_post_like_post_id_guest_id_uidx" ON "community_post_like" USING btree ("post_id","guest_id");--> statement-breakpoint
ALTER TABLE "community_comment" ADD CONSTRAINT "community_comment_author_one_of_ck" CHECK (num_nonnulls("community_comment"."author_user_id", "community_comment"."author_guest_id") = 1);--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_author_one_of_ck" CHECK (num_nonnulls("community_post"."author_user_id", "community_post"."author_guest_id") = 1);--> statement-breakpoint
ALTER TABLE "community_post_like" ADD CONSTRAINT "community_post_like_actor_one_of_ck" CHECK (num_nonnulls("community_post_like"."user_id", "community_post_like"."guest_id") = 1);