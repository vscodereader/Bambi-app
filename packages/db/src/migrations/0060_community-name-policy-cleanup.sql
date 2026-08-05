-- 일반 회원의 기존 예약 닉네임을 안전한 임시 표시명으로 치환한다.
UPDATE "user" AS u
SET "name" = '회원-' || right(u."id", 6),
    "updated_at" = now()
WHERE NOT EXISTS (
    SELECT 1
    FROM "bambi_profile" AS profile
    WHERE profile."user_id" = u."id"
      AND profile."role" = 'admin'
)
AND (
    lower(regexp_replace(u."name", '[^[:alnum:]가-힣]', '', 'g')) LIKE '%admin%'
    OR regexp_replace(u."name", '[^[:alnum:]가-힣]', '', 'g') LIKE '%관리자%'
);

-- 운영자 계정·운영자 역할로 작성된 글은 유지하고 일반 작성인의 예약어만 치환한다.
UPDATE "community_post" AS post
SET "author_display_name" = '회원',
    "updated_at" = now()
WHERE post."author_role" <> 'admin'
AND NOT EXISTS (
    SELECT 1
    FROM "bambi_profile" AS profile
    WHERE profile."user_id" = post."author_user_id"
      AND profile."role" = 'admin'
)
AND (
    lower(regexp_replace(post."author_display_name", '[^[:alnum:]가-힣]', '', 'g')) LIKE '%admin%'
    OR regexp_replace(post."author_display_name", '[^[:alnum:]가-힣]', '', 'g') LIKE '%관리자%'
);

-- 자유수다의 기존 비밀글은 복구 가능한 소프트 삭제로 정리한다.
UPDATE "community_post"
SET "status" = 'deleted',
    "updated_at" = now()
WHERE "board" = 'free'
  AND "is_locked" = true
  AND "status" <> 'deleted';
