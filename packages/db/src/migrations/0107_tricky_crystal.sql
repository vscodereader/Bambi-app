CREATE TYPE "public"."point_job_reward_category" AS ENUM('premium', 'special', 'recommended');--> statement-breakpoint
CREATE TYPE "public"."point_job_target_source" AS ENUM('job_post', 'crawled_job_post');--> statement-breakpoint
CREATE TABLE "bambi_point_job_daily_selection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"selected_on" date NOT NULL,
	"category" "point_job_reward_category" NOT NULL,
	"target_source" "point_job_target_source" NOT NULL,
	"target_id" uuid NOT NULL,
	"title_snapshot" text NOT NULL,
	"selected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bambi_point_job_reward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category" "point_job_reward_category" NOT NULL,
	"selection_id" uuid,
	"selected_on" date NOT NULL,
	"target_source" "point_job_target_source" NOT NULL,
	"target_id" uuid NOT NULL,
	"title_snapshot" text NOT NULL,
	"amount" integer NOT NULL,
	"rewarded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bambi_point_job_reward_amount_positive_ck" CHECK ("bambi_point_job_reward"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "community_notice_board_placement" (
	"post_id" uuid NOT NULL,
	"board_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "community_notice_board_placement_post_id_board_key_pk" PRIMARY KEY("post_id","board_key")
);
--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "point_job_reward_points" integer;--> statement-breakpoint
ALTER TABLE "bambi_point_job_reward" ADD CONSTRAINT "bambi_point_job_reward_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_point_job_reward" ADD CONSTRAINT "bambi_point_job_reward_selection_id_bambi_point_job_daily_selection_id_fk" FOREIGN KEY ("selection_id") REFERENCES "public"."bambi_point_job_daily_selection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_notice_board_placement" ADD CONSTRAINT "community_notice_board_placement_post_id_community_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_notice_board_placement" ADD CONSTRAINT "community_notice_board_placement_board_key_community_board_key_fk" FOREIGN KEY ("board_key") REFERENCES "public"."community_board"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_point_job_daily_selection_date_category_uidx" ON "bambi_point_job_daily_selection" USING btree ("selected_on","category");--> statement-breakpoint
CREATE INDEX "bambi_point_job_daily_selection_target_idx" ON "bambi_point_job_daily_selection" USING btree ("target_source","target_id");--> statement-breakpoint
CREATE INDEX "bambi_point_job_reward_user_category_rewarded_idx" ON "bambi_point_job_reward" USING btree ("user_id","category","rewarded_at");--> statement-breakpoint
CREATE INDEX "community_notice_board_placement_board_post_idx" ON "community_notice_board_placement" USING btree ("board_key","post_id");
