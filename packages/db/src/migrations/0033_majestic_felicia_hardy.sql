-- 상품 레벨 할인율을 제거하기 전에, 이미 설정된 값(>0)을 각 가격 옵션의 jsonb로 접어 넣어 보존한다.
UPDATE "ad_product" SET "price_options" = (
	SELECT jsonb_agg(opt || jsonb_build_object('discountPercent', "discount_percent"))
	FROM jsonb_array_elements("price_options") AS opt
)
WHERE "discount_percent" > 0 AND jsonb_array_length("price_options") > 0;--> statement-breakpoint
ALTER TABLE "ad_product" DROP COLUMN "discount_percent";
