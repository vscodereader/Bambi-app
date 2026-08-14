CREATE TABLE "bambi_member_grade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"min_points" integer NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bambi_member_grade_min_points_unique" UNIQUE("min_points")
);
--> statement-breakpoint
ALTER TABLE "community_board" ADD COLUMN "post_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "community_board" ADD COLUMN "comment_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "community_comment" ADD COLUMN "points_awarded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "community_post" ADD COLUMN "points_awarded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO "bambi_member_grade" ("name", "min_points") VALUES
	('새싹', 0),
	('일반', 1000),
	('우수회원', 5000),
	('열혈회원', 20000),
	('VIP', 50000);--> statement-breakpoint
UPDATE "community_board" SET "post_points" = 100, "comment_points" = 50 WHERE "key" = 'free';