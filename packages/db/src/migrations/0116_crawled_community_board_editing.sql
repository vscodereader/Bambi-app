CREATE TABLE "crawled_community_comment_edit" (
	"topic_id" uuid NOT NULL,
	"source_comment_id" text NOT NULL,
	"edited_body" text NOT NULL,
	"edited_at" timestamp NOT NULL,
	"edited_by_user_id" text,
	CONSTRAINT "crawled_community_comment_edit_topic_id_source_comment_id_pk" PRIMARY KEY("topic_id","source_comment_id")
);
--> statement-breakpoint
DROP INDEX "crawled_community_topic_source_uidx";--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "crawl_community_board_key" text;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "crawled_community_editor_grade_id" uuid;--> statement-breakpoint
ALTER TABLE "crawl_run" ADD COLUMN "board_key" text;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD COLUMN "board_key" text;
--> statement-breakpoint
UPDATE "crawled_community_topic" SET "board_key" = 'work_talk';
--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ALTER COLUMN "board_key" SET NOT NULL;
--> statement-breakpoint
INSERT INTO "bambi_site_settings" ("id", "crawl_community_board_key") VALUES ('default', 'work_talk')
ON CONFLICT ("id") DO UPDATE SET "crawl_community_board_key" = 'work_talk';
--> statement-breakpoint
UPDATE "crawled_community_topic" AS topic SET "comments" = (
 SELECT jsonb_agg(value || jsonb_build_object('id', coalesce(value->>'id', 'legacy:' || topic.id::text || ':' || (ordinality - 1)::text)) ORDER BY ordinality)
 FROM jsonb_array_elements(topic.comments) WITH ORDINALITY AS c(value, ordinality)
) WHERE jsonb_array_length(topic.comments) > 0;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD COLUMN "edited_title" text;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD COLUMN "edited_body" text;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD COLUMN "edited_body_text" text;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD COLUMN "edited_at" timestamp;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD COLUMN "edited_by_user_id" text;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD COLUMN "activity_at" timestamp;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD COLUMN "edit_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crawled_community_comment_edit" ADD CONSTRAINT "crawled_community_comment_edit_topic_id_crawled_community_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."crawled_community_topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawled_community_comment_edit" ADD CONSTRAINT "crawled_community_comment_edit_edited_by_user_id_user_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD CONSTRAINT "bambi_site_settings_crawl_community_board_key_community_board_key_fk" FOREIGN KEY ("crawl_community_board_key") REFERENCES "public"."community_board"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD CONSTRAINT "bambi_site_settings_crawled_community_editor_grade_id_bambi_member_grade_id_fk" FOREIGN KEY ("crawled_community_editor_grade_id") REFERENCES "public"."bambi_member_grade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD CONSTRAINT "crawled_community_topic_board_key_community_board_key_fk" FOREIGN KEY ("board_key") REFERENCES "public"."community_board"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawled_community_topic" ADD CONSTRAINT "crawled_community_topic_edited_by_user_id_user_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawled_community_topic_board_idx" ON "crawled_community_topic" USING btree ("board_key","activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crawled_community_topic_source_uidx" ON "crawled_community_topic" USING btree ("source_site","source_external_id","board_key");