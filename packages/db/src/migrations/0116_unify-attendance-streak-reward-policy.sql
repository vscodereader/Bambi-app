UPDATE "bambi_attendance"
SET "streak_reward_eligible" = true
WHERE "streak_reward_eligible" = false;--> statement-breakpoint
WITH "ordered_attendance" AS (
	SELECT
		"attendance"."user_id",
		"attendance"."attended_on",
		"attendance"."attended_on" - (
			row_number() OVER (
				PARTITION BY "attendance"."user_id"
				ORDER BY "attendance"."attended_on"
			)
		)::integer AS "run_group"
	FROM "bambi_attendance" AS "attendance"
	INNER JOIN "bambi_profile" AS "profile"
		ON "profile"."user_id" = "attendance"."user_id"
	WHERE "profile"."role" = 'job_seeker'
),
"current_runs" AS (
	SELECT
		"user_id",
		min("attended_on") AS "run_start_on",
		max("attended_on") AS "run_end_on",
		count(*)::integer AS "run_length"
	FROM "ordered_attendance"
	GROUP BY "user_id", "run_group"
	HAVING max("attended_on") >=
		((now() AT TIME ZONE 'Asia/Seoul')::date - 1)
),
"claim_counts" AS (
	SELECT
		"run".*,
		count("claim"."id")::integer AS "claim_count"
	FROM "current_runs" AS "run"
	LEFT JOIN "bambi_attendance_streak_claim" AS "claim"
		ON "claim"."user_id" = "run"."user_id"
		AND "claim"."run_start_on" >= "run"."run_start_on"
		AND "claim"."run_end_on" <= "run"."run_end_on"
	GROUP BY
		"run"."user_id",
		"run"."run_start_on",
		"run"."run_end_on",
		"run"."run_length"
),
"entitlements" AS (
	SELECT
		"run"."user_id",
		"run"."run_start_on",
		"run"."run_start_on" + ("claim_number" * 7 - 1) AS "trigger_on",
		"claim_number"
	FROM "claim_counts" AS "run"
	CROSS JOIN LATERAL generate_series(
		"run"."claim_count" + 1,
		floor("run"."run_length" / 7.0)::integer
	) AS "claim_number"
),
"current_balances" AS (
	SELECT
		"user_id",
		coalesce(sum("quantity"), 0)::integer AS "balance"
	FROM "bambi_member_item_transaction"
	WHERE "item_type" = 'draw_ticket'
	GROUP BY "user_id"
),
"transactions_to_insert" AS (
	SELECT
		gen_random_uuid() AS "id",
		"entitlement"."user_id",
		"entitlement"."run_start_on",
		"entitlement"."trigger_on",
		'7일 연속 출석 보상'::text AS "description",
		concat(
			'attendance_streak:',
			"entitlement"."user_id",
			':',
			"entitlement"."trigger_on"::text
		) AS "external_key",
		coalesce("balance"."balance", 0) + row_number() OVER (
			PARTITION BY "entitlement"."user_id"
			ORDER BY "entitlement"."claim_number"
		)::integer AS "balance_after"
	FROM "entitlements" AS "entitlement"
	LEFT JOIN "current_balances" AS "balance"
		ON "balance"."user_id" = "entitlement"."user_id"
)
INSERT INTO "bambi_member_item_transaction" (
	"id",
	"user_id",
	"item_type",
	"quantity",
	"reason",
	"external_key",
	"reference_type",
	"reference_id",
	"description",
	"balance_after"
)
SELECT
	"id",
	"user_id",
	'draw_ticket',
	1,
	'attendance_streak',
	"external_key",
	'attendance_streak_claim',
	"trigger_on"::text,
	"description",
	"balance_after"
FROM "transactions_to_insert"
ON CONFLICT ("external_key") DO NOTHING;--> statement-breakpoint
WITH "ordered_attendance" AS (
	SELECT
		"attendance"."user_id",
		"attendance"."attended_on",
		"attendance"."attended_on" - (
			row_number() OVER (
				PARTITION BY "attendance"."user_id"
				ORDER BY "attendance"."attended_on"
			)
		)::integer AS "run_group"
	FROM "bambi_attendance" AS "attendance"
	INNER JOIN "bambi_profile" AS "profile"
		ON "profile"."user_id" = "attendance"."user_id"
	WHERE "profile"."role" = 'job_seeker'
),
"current_runs" AS (
	SELECT
		"user_id",
		min("attended_on") AS "run_start_on",
		max("attended_on") AS "run_end_on",
		count(*)::integer AS "run_length"
	FROM "ordered_attendance"
	GROUP BY "user_id", "run_group"
	HAVING max("attended_on") >=
		((now() AT TIME ZONE 'Asia/Seoul')::date - 1)
),
"entitlements" AS (
	SELECT
		"run"."user_id",
		"run"."run_start_on",
		"run"."run_start_on" + ("claim_number" * 7 - 1) AS "trigger_on"
	FROM "current_runs" AS "run"
	CROSS JOIN LATERAL generate_series(
		1,
		floor("run"."run_length" / 7.0)::integer
	) AS "claim_number"
),
"reward_transactions" AS (
	SELECT
		"entitlement"."user_id",
		"entitlement"."run_start_on",
		"entitlement"."trigger_on",
		"transaction"."id" AS "item_transaction_id"
	FROM "entitlements" AS "entitlement"
	INNER JOIN "bambi_member_item_transaction" AS "transaction"
		ON "transaction"."external_key" = concat(
			'attendance_streak:',
			"entitlement"."user_id",
			':',
			"entitlement"."trigger_on"::text
		)
)
INSERT INTO "bambi_attendance_streak_claim" (
	"user_id",
	"run_start_on",
	"run_end_on",
	"trigger_attended_on",
	"item_transaction_id"
)
SELECT
	"reward"."user_id",
	"reward"."run_start_on",
	"reward"."trigger_on",
	"reward"."trigger_on",
	"reward"."item_transaction_id"
FROM "reward_transactions" AS "reward"
WHERE NOT EXISTS (
	SELECT 1
	FROM "bambi_attendance_streak_claim" AS "claim"
	WHERE "claim"."item_transaction_id" = "reward"."item_transaction_id"
);
