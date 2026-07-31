ALTER TABLE "job_post" ADD COLUMN "detected_terms" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- 기존에 코드로 하드코딩돼 있던 공고 위험어를 운영자 금칙어 목록으로 옮긴다.
-- 세 단어 모두 공백·구두점이 없어 normalizeForMatch 결과가 원문과 같다.
-- admin 사용자가 없는 환경에서는 소유자를 정할 수 없으므로 시드를 건너뛴다.
INSERT INTO "banned_word" ("term", "normalized_term", "is_active", "created_by_user_id")
SELECT t.term, t.term, true, u.user_id
FROM (VALUES ('미성년'), ('성매매'), ('강요')) AS t(term)
CROSS JOIN (
	SELECT "user_id" FROM "bambi_profile" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
) AS u
ON CONFLICT ("normalized_term") DO NOTHING;
