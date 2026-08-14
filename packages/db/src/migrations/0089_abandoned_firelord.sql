ALTER TABLE "report" ADD COLUMN "resolution_reason" text;
--> statement-breakpoint
UPDATE "report" AS "reported"
SET "resolution_reason" = "latest_action"."reason"
FROM (
	SELECT DISTINCT ON ("metadata"->>'reportId')
		"metadata"->>'reportId' AS "report_id",
		"reason"
	FROM "admin_moderation_action"
	WHERE "action" = 'set_report_status:dismissed'
		AND "metadata"->>'reportId' IS NOT NULL
	ORDER BY "metadata"->>'reportId', "created_at" DESC
) AS "latest_action"
WHERE "reported"."id"::text = "latest_action"."report_id"
	AND "reported"."status" = 'dismissed';
