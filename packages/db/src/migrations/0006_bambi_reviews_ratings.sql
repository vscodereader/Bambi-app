CREATE TYPE "public"."review_status" AS ENUM('published', 'pending_review', 'hidden');--> statement-breakpoint
ALTER TABLE "review" DROP CONSTRAINT "review_interview_schedule_id_interview_schedule_id_fk";
--> statement-breakpoint
ALTER TABLE "review" DROP CONSTRAINT "review_target_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "review_interview_schedule_id_reviewer_user_id_uidx";--> statement-breakpoint
DROP INDEX "review_target_user_id_idx";--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "job_post_id" uuid;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "chat_room_id" uuid;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "status" "review_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "review"
SET
	"body" = COALESCE("review"."body", ''),
	"chat_room_id" = "interview_schedule"."chat_room_id",
	"job_post_id" = "chat_room"."job_post_id",
	"organization_id" = "chat_room"."organization_id"
FROM "interview_schedule"
INNER JOIN "chat_room" ON "chat_room"."id" = "interview_schedule"."chat_room_id"
WHERE "review"."interview_schedule_id" = "interview_schedule"."id";--> statement-breakpoint
DELETE FROM "review"
WHERE
	"chat_room_id" IS NULL
	OR "job_post_id" IS NULL
	OR "organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "review" ALTER COLUMN "body" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review" ALTER COLUMN "job_post_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review" ALTER COLUMN "chat_room_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_job_post_id_job_post_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_chat_room_id_chat_room_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_chat_room_id_reviewer_user_id_uidx" ON "review" USING btree ("chat_room_id","reviewer_user_id");--> statement-breakpoint
CREATE INDEX "review_job_post_id_status_idx" ON "review" USING btree ("job_post_id","status");--> statement-breakpoint
CREATE INDEX "review_organization_id_idx" ON "review" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "review_reviewer_user_id_idx" ON "review" USING btree ("reviewer_user_id");--> statement-breakpoint
ALTER TABLE "review" DROP COLUMN "interview_schedule_id";--> statement-breakpoint
ALTER TABLE "review" DROP COLUMN "target_user_id";--> statement-breakpoint
ALTER TABLE "review" DROP COLUMN "is_hidden";
