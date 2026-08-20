CREATE TABLE "community_board_home_layout" (
	"board_key" text PRIMARY KEY NOT NULL,
	"row_index" integer NOT NULL,
	"position" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_post_like_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"post_id" uuid NOT NULL,
	"board_key" text NOT NULL,
	"board_slug" text NOT NULL,
	"title" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"liked_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bambi_identity_verification_log" ADD COLUMN "guest_id" text;--> statement-breakpoint
ALTER TABLE "bambi_member_grade" ADD COLUMN "icon_storage_key" text;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "review_write_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "review_view_points" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "community_comment" ADD COLUMN "author_gender" "bambi_gender";--> statement-breakpoint
ALTER TABLE "community_post" ADD COLUMN "author_gender" "bambi_gender";--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "points_awarded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "community_post_like_history" ADD CONSTRAINT "community_post_like_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_board_home_layout_row_position_uidx" ON "community_board_home_layout" USING btree ("row_index","position");--> statement-breakpoint
CREATE UNIQUE INDEX "community_post_like_history_user_post_uidx" ON "community_post_like_history" USING btree ("user_id","post_id");--> statement-breakpoint
CREATE INDEX "community_post_like_history_user_active_liked_idx" ON "community_post_like_history" USING btree ("user_id","is_active","liked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_identity_verification_log_guest_id_uidx" ON "bambi_identity_verification_log" USING btree ("guest_id");--> statement-breakpoint
INSERT INTO "community_post_like_history" ("user_id", "post_id", "board_key", "board_slug", "title", "is_active", "liked_at")
SELECT l."user_id", p."id", p."board", b."slug", p."title", true, l."created_at"
FROM "community_post_like" l
INNER JOIN "community_post" p ON p."id" = l."post_id"
INNER JOIN "community_board" b ON b."key" = p."board"
WHERE l."user_id" IS NOT NULL
ON CONFLICT ("user_id", "post_id") DO NOTHING;--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM "review" GROUP BY "job_post_id", "reviewer_user_id" HAVING count(*) > 1) THEN
		RAISE EXCEPTION '공고별 중복 후기가 있어 review unique index를 생성할 수 없습니다.';
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "review_job_post_id_reviewer_user_id_uidx" ON "review" USING btree ("job_post_id","reviewer_user_id");--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD CONSTRAINT "bambi_site_settings_review_points_check" CHECK ("review_write_points" >= 0 AND "review_view_points" >= 0);--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_points_awarded_check" CHECK ("points_awarded" >= 0);--> statement-breakpoint
INSERT INTO "community_board" ("key", "slug", "label", "description", "icon", "is_active", "is_writable", "sort_order", "post_points", "comment_points")
SELECT 'secret', 'secret', '비밀글', '본인인증 이용자가 익명으로 이야기를 나눠요', 'MessageSquareLock', true, true, COALESCE(MAX("sort_order") + 10, 0), 0, 0
FROM "community_board"
ON CONFLICT ("key") DO UPDATE SET "slug" = excluded."slug", "label" = excluded."label", "description" = excluded."description", "icon" = excluded."icon";--> statement-breakpoint
UPDATE "bambi_point_transaction" AS "transaction"
SET "description" = '후기 작성 · ' || "job"."title"
FROM "review" AS "review_row"
INNER JOIN "job_post" AS "job" ON "job"."id" = "review_row"."job_post_id"
WHERE "transaction"."reason" = 'review_write'
	AND "transaction"."external_key" = 'review_write:' || "review_row"."id"::text || ':created'
	AND ("transaction"."description" IS NULL OR "transaction"."description" LIKE '후기 작성:%');--> statement-breakpoint
