CREATE TYPE "public"."banned_word_scope" AS ENUM('content', 'display_name');--> statement-breakpoint
DROP INDEX "banned_word_normalized_term_uidx";--> statement-breakpoint
DROP INDEX "banned_word_is_active_idx";--> statement-breakpoint
ALTER TABLE "banned_word" ADD COLUMN "scope" "banned_word_scope" DEFAULT 'content' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "banned_word_scope_normalized_term_uidx" ON "banned_word" USING btree ("scope","normalized_term");--> statement-breakpoint
CREATE INDEX "banned_word_scope_is_active_idx" ON "banned_word" USING btree ("scope","is_active");--> statement-breakpoint
-- 기존 런타임 하드코딩을 운영자 관리 데이터로 옮긴다. 최초 운영자가 없는 환경은 건너뛴다.
INSERT INTO "banned_word" ("scope", "term", "normalized_term", "is_active", "created_by_user_id")
SELECT 'display_name', t.term, t.normalized_term, true, admin.user_id
FROM (VALUES ('Admin', 'admin'), ('관리자', '관리자')) AS t(term, normalized_term)
CROSS JOIN (
	SELECT "user_id" FROM "bambi_profile" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
) AS admin
ON CONFLICT ("scope", "normalized_term") DO NOTHING;
