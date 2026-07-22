CREATE TYPE "public"."job_industry_category" AS ENUM('룸싸롱', '텐프로/쩜오', '노래주점', '단란주점', '다방', 'BAR', '마사지', '요정');--> statement-breakpoint
-- 자유 입력이던 기존 업종을 확정 8종으로 매핑한 뒤 enum으로 캐스팅한다.
-- (마이그레이션 시점 dev 데이터: 라운지·클럽·바·호스트바·카페·노래방 — 근사 업종으로 흡수,
--  목록 밖 미지 값은 BAR로 폴백해 캐스팅 실패를 막는다.)
UPDATE "job_post" SET "industry_category" = CASE "industry_category"
	WHEN '노래방' THEN '노래주점'
	WHEN '카페' THEN '다방'
	WHEN '바' THEN 'BAR'
	WHEN '라운지' THEN '룸싸롱'
	WHEN '클럽' THEN 'BAR'
	WHEN '호스트바' THEN 'BAR'
	ELSE CASE WHEN "industry_category" IN ('룸싸롱', '텐프로/쩜오', '노래주점', '단란주점', '다방', 'BAR', '마사지', '요정') THEN "industry_category" ELSE 'BAR' END
END;--> statement-breakpoint
ALTER TABLE "job_post" ALTER COLUMN "industry_category" SET DATA TYPE "public"."job_industry_category" USING "industry_category"::"public"."job_industry_category";
