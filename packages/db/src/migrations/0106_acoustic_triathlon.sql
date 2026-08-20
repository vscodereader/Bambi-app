ALTER TABLE "community_post_like_history" ADD COLUMN "post_created_at" timestamp;--> statement-breakpoint
UPDATE "community_post_like_history" AS "history"
SET "post_created_at" = COALESCE(
	(SELECT "post"."created_at" FROM "community_post" AS "post" WHERE "post"."id" = "history"."post_id"),
	"history"."liked_at"
);--> statement-breakpoint
ALTER TABLE "community_post_like_history" ALTER COLUMN "post_created_at" SET NOT NULL;
