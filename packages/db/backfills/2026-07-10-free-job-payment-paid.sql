-- 무료 공고 즉시 노출 정책 백필 (2026-07-10)
--
-- 유료 노출상품을 선택하지 않은(ad_product_id IS NULL) 무료 공고 중, 이미 게시(published)
-- 됐지만 미결제(unpaid)로 남아 공개 목록·상세에 노출되지 않던 기존 데이터를 결제완료(paid)로
-- 전환한다. 신규 등록(create)과 dev 시드는 코드에서 자동으로 paid 처리되므로, 이 스크립트는
-- 정책 도입 이전에 쌓인 기존 데이터를 정합화하는 1회성 백필이다.
--
-- 이 파일은 drizzle 마이그레이션 저널(_journal.json/스냅샷)과 무관한 데이터 전용 스크립트다.
-- 스키마 변경이 없어 drizzle-kit generate 대상이 아니며, 아래처럼 DB에 직접 실행한다:
--   psql "$DATABASE_URL" -f packages/db/backfills/2026-07-10-free-job-payment-paid.sql

UPDATE job_post
SET payment_status = 'paid'
WHERE ad_product_id IS NULL
  AND status = 'published'
  AND payment_status = 'unpaid';
