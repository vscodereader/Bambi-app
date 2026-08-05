-- 같은 사람((birth_date, phone_number))의 중복 행 정리: updated_at 최신 1행만 남긴다.
-- phone_number IS NULL 행은 사람을 특정할 수 없으므로 건드리지 않는다.
DELETE FROM "bambi_identity_verification_log" l
USING "bambi_identity_verification_log" newer
WHERE l."phone_number" IS NOT NULL
  AND newer."phone_number" = l."phone_number"
  AND newer."birth_date" = l."birth_date"
  AND (newer."updated_at" > l."updated_at"
    OR (newer."updated_at" = l."updated_at" AND newer."id" > l."id"));--> statement-breakpoint
DROP INDEX "bambi_identity_verification_log_iv_id_uidx";--> statement-breakpoint
CREATE INDEX "bambi_identity_verification_log_iv_id_idx" ON "bambi_identity_verification_log" USING btree ("identity_verification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_identity_verification_log_person_uidx" ON "bambi_identity_verification_log" USING btree ("birth_date","phone_number") WHERE "bambi_identity_verification_log"."phone_number" IS NOT NULL;