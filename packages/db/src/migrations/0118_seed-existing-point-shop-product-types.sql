INSERT INTO "bambi_point_shop_product_type" ("name")
SELECT "seed"."name"
FROM (VALUES
	('일반 상품'),
	('포인트권'),
	('끌어올리기권'),
	('상품권')
) AS "seed"("name")
WHERE NOT EXISTS (
	SELECT 1
	FROM "bambi_point_shop_product_type" AS "existing"
	WHERE lower("existing"."name") = lower("seed"."name")
);
