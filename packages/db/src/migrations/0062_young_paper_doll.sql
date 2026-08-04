-- develop 병합 시 0060·0061 번호가 PR #71과 겹쳐 기존 0060_numerous_butterfly(invite_reason)·
-- 0061_ancient_magneto(on_hold)를 0062로 재생성했다. dev DB에는 옛 번호로 이미 적용돼
-- 있어 재실행돼도 안전하도록 IF NOT EXISTS를 붙인다(신규 환경에는 그대로 적용된다).
ALTER TYPE "public"."job_post_status" ADD VALUE IF NOT EXISTS 'on_hold';--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "invite_reason" text;