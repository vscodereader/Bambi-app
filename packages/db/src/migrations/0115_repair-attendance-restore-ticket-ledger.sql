WITH "repair_items" AS (
	SELECT "item"."id"
	FROM "bambi_point_shop_item" AS "item"
	INNER JOIN "bambi_point_shop_category" AS "category"
		ON "category"."id" = "item"."category_id"
	WHERE "category"."key" = 'attendance'
		AND "item"."benefit_type" = 'draw_ticket'
)
UPDATE "bambi_point_shop_item" AS "item"
SET
	"audience" = 'job_seeker',
	"benefit_type" = 'attendance_restore_ticket',
	"updated_at" = now()
FROM "repair_items"
WHERE "item"."id" = "repair_items"."id";--> statement-breakpoint
WITH "repair_items" AS (
	SELECT "item"."id"
	FROM "bambi_point_shop_item" AS "item"
	INNER JOIN "bambi_point_shop_category" AS "category"
		ON "category"."id" = "item"."category_id"
	WHERE "category"."key" = 'attendance'
		AND "item"."benefit_type" = 'attendance_restore_ticket'
)
UPDATE "bambi_point_shop_order" AS "order"
SET "benefit_type" = 'attendance_restore_ticket'
FROM "repair_items"
WHERE "order"."item_id" = "repair_items"."id"
	AND "order"."benefit_type" = 'draw_ticket';--> statement-breakpoint
WITH "repair_orders" AS (
	SELECT "order"."id"
	FROM "bambi_point_shop_order" AS "order"
	INNER JOIN "bambi_point_shop_item" AS "item"
		ON "item"."id" = "order"."item_id"
	INNER JOIN "bambi_point_shop_category" AS "category"
		ON "category"."id" = "item"."category_id"
	WHERE "category"."key" = 'attendance'
		AND "item"."benefit_type" = 'attendance_restore_ticket'
		AND "order"."benefit_type" = 'attendance_restore_ticket'
)
UPDATE "bambi_member_item_transaction" AS "transaction"
SET "item_type" = 'attendance_restore_ticket'
FROM "repair_orders"
WHERE "transaction"."point_shop_order_id" = "repair_orders"."id"
	AND "transaction"."item_type" = 'draw_ticket';--> statement-breakpoint
WITH "affected_users" AS (
	SELECT DISTINCT "transaction"."user_id"
	FROM "bambi_member_item_transaction" AS "transaction"
	INNER JOIN "bambi_point_shop_order" AS "order"
		ON "order"."id" = "transaction"."point_shop_order_id"
	INNER JOIN "bambi_point_shop_item" AS "item"
		ON "item"."id" = "order"."item_id"
	INNER JOIN "bambi_point_shop_category" AS "category"
		ON "category"."id" = "item"."category_id"
	WHERE "category"."key" = 'attendance'
		AND "item"."benefit_type" = 'attendance_restore_ticket'
),
"running_balances" AS (
	SELECT
		"transaction"."id",
		sum("transaction"."quantity") OVER (
			PARTITION BY "transaction"."user_id", "transaction"."item_type"
			ORDER BY "transaction"."created_at", "transaction"."id"
		)::integer AS "balance_after"
	FROM "bambi_member_item_transaction" AS "transaction"
	WHERE "transaction"."user_id" IN (SELECT "user_id" FROM "affected_users")
		AND "transaction"."item_type" IN ('draw_ticket', 'attendance_restore_ticket')
)
UPDATE "bambi_member_item_transaction" AS "transaction"
SET "balance_after" = "running_balances"."balance_after"
FROM "running_balances"
WHERE "transaction"."id" = "running_balances"."id";
