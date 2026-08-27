ALTER TABLE "bambi_point_draw_prize" DROP CONSTRAINT "bambi_point_draw_prize_weight_positive_ck";--> statement-breakpoint
ALTER TABLE "bambi_point_draw" ALTER COLUMN "prize_weight_snapshot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_point_draw" ADD COLUMN "prize_probability_units_snapshot" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_draw_prize" ADD COLUMN "probability_units" integer;--> statement-breakpoint
WITH "active_prizes" AS (
	SELECT
		"id",
		"weight",
		row_number() OVER (ORDER BY "sort_order", "id") AS "position",
		count(*) OVER () AS "prize_count",
		sum("weight") OVER () AS "total_weight"
	FROM "bambi_point_draw_prize"
	WHERE "is_active" = true
),
"base_probabilities" AS (
	SELECT
		"id",
		"position",
		"prize_count",
		floor(("weight"::bigint * 100000000) / "total_weight")::integer AS "base_units"
	FROM "active_prizes"
),
"resolved_probabilities" AS (
	SELECT
		"id",
		"base_units" + CASE
			WHEN "position" = "prize_count"
				THEN 100000000 - sum("base_units") OVER ()
			ELSE 0
		END AS "probability_units"
	FROM "base_probabilities"
)
UPDATE "bambi_point_draw_prize" AS "prize"
SET "probability_units" = "resolved"."probability_units"
FROM "resolved_probabilities" AS "resolved"
WHERE "prize"."id" = "resolved"."id";--> statement-breakpoint
ALTER TABLE "bambi_point_draw_prize" DROP COLUMN "weight";--> statement-breakpoint
ALTER TABLE "bambi_point_draw_prize" ADD CONSTRAINT "bambi_point_draw_prize_probability_units_ck" CHECK ("bambi_point_draw_prize"."probability_units" IS NULL OR ("bambi_point_draw_prize"."probability_units" > 0 AND "bambi_point_draw_prize"."probability_units" <= 100000000));
