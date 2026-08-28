CREATE TABLE "bambi_comment_milestone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_count" integer NOT NULL,
	"bonus_points" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bambi_comment_milestone_comment_count_unique" UNIQUE("comment_count")
);
--> statement-breakpoint
CREATE TABLE "bambi_comment_milestone_award" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"milestone_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "comment_bonus_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "comment_bonus_chance_percent" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "comment_bonus_min_points" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "comment_bonus_max_points" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "community_comment" ADD COLUMN "bonus_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "community_comment" ADD COLUMN "bonus_points_awarded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_comment_milestone_award" ADD CONSTRAINT "bambi_comment_milestone_award_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_comment_milestone_award" ADD CONSTRAINT "bambi_comment_milestone_award_milestone_id_bambi_comment_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."bambi_comment_milestone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_comment_milestone_award_user_milestone_uidx" ON "bambi_comment_milestone_award" USING btree ("user_id","milestone_id");--> statement-breakpoint
INSERT INTO "bambi_comment_milestone" ("comment_count", "bonus_points") VALUES
	(10, 100),
	(50, 300),
	(100, 500),
	(500, 2000),
	(1000, 5000)
ON CONFLICT ("comment_count") DO NOTHING;