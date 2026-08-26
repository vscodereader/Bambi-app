ALTER TABLE "bambi_point_shop_item" ALTER COLUMN "price_points" DROP NOT NULL;--> statement-breakpoint
INSERT INTO "bambi_point_shop_category" ("key", "name", "kind", "is_active") VALUES
	('boost', '끌어올리기', 'standard', true),
	('attendance', '출석', 'standard', true)
ON CONFLICT ("key") DO UPDATE SET
	"name" = EXCLUDED."name",
	"is_active" = true,
	"updated_at" = now();--> statement-breakpoint
UPDATE "bambi_point_shop_category"
SET "name" = '기타', "updated_at" = now()
WHERE "key" = 'other';--> statement-breakpoint
DELETE FROM "bambi_point_shop_layout_row"
WHERE "category_id" IS NULL
	OR "category_id" IN (
		SELECT duplicate."id"
		FROM "bambi_point_shop_category" AS duplicate
		WHERE duplicate."kind" = 'standard'
			AND duplicate."key" LIKE 'custom:%'
			AND duplicate."name" IN ('끌어올리기', '출석', '기타', '기타 아이템')
			AND NOT EXISTS (
				SELECT 1 FROM "bambi_point_shop_item" AS item
				WHERE item."category_id" = duplicate."id"
			)
	);--> statement-breakpoint
DELETE FROM "bambi_point_shop_category" AS duplicate
WHERE duplicate."kind" = 'standard'
	AND duplicate."key" LIKE 'custom:%'
	AND duplicate."name" IN ('끌어올리기', '출석', '기타', '기타 아이템')
	AND NOT EXISTS (
		SELECT 1 FROM "bambi_point_shop_item" AS item
		WHERE item."category_id" = duplicate."id"
	);--> statement-breakpoint
UPDATE "bambi_point_shop_layout_row"
SET "position" = "position" + 1000;--> statement-breakpoint
WITH base AS (
	SELECT coalesce(max("position"), 1000) AS max_position
	FROM "bambi_point_shop_layout_row"
), missing AS (
	SELECT category."id", row_number() OVER (ORDER BY category."key") AS offset
	FROM "bambi_point_shop_category" AS category
	WHERE category."key" IN ('boost', 'attendance')
		AND NOT EXISTS (
			SELECT 1 FROM "bambi_point_shop_layout_row" AS layout
			WHERE layout."category_id" = category."id"
		)
)
INSERT INTO "bambi_point_shop_layout_row" ("position", "category_id")
SELECT base.max_position + missing.offset, missing."id"
FROM missing CROSS JOIN base;--> statement-breakpoint
WITH ordered AS (
	SELECT
		layout."id",
		row_number() OVER (
			ORDER BY
				CASE category."key"
					WHEN 'featured' THEN 0
					WHEN 'gift-card' THEN 1
					WHEN 'boost' THEN 2
					WHEN 'attendance' THEN 3
					WHEN 'other' THEN 4
					ELSE 5
				END,
				layout."position",
				layout."id"
		) - 1 AS next_position
	FROM "bambi_point_shop_layout_row" AS layout
	LEFT JOIN "bambi_point_shop_category" AS category ON category."id" = layout."category_id"
)
UPDATE "bambi_point_shop_layout_row" AS layout
SET "position" = ordered.next_position, "updated_at" = now()
FROM ordered
WHERE layout."id" = ordered."id";--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_point_shop_category_standard_name_uidx" ON "bambi_point_shop_category" USING btree (lower("name")) WHERE "bambi_point_shop_category"."kind" = 'standard';
