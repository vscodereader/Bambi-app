CREATE TYPE "public"."community_board" AS ENUM('free', 'work_talk', 'market');--> statement-breakpoint
CREATE TYPE "public"."community_content_status" AS ENUM('published', 'hidden', 'deleted');--> statement-breakpoint
ALTER TYPE "public"."moderation_target_type" ADD VALUE 'community_post';--> statement-breakpoint
CREATE TABLE "community_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"status" "community_content_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board" "community_board" NOT NULL,
	"author_user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"status" "community_content_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_post_like" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_comment" ADD CONSTRAINT "community_comment_post_id_community_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment" ADD CONSTRAINT "community_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_like" ADD CONSTRAINT "community_post_like_post_id_community_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_like" ADD CONSTRAINT "community_post_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_comment_post_id_status_created_at_idx" ON "community_comment" USING btree ("post_id","status","created_at");--> statement-breakpoint
CREATE INDEX "community_comment_author_user_id_idx" ON "community_comment" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "community_post_board_status_created_at_idx" ON "community_post" USING btree ("board","status","created_at");--> statement-breakpoint
CREATE INDEX "community_post_status_created_at_idx" ON "community_post" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "community_post_author_user_id_idx" ON "community_post" USING btree ("author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_post_like_post_id_user_id_uidx" ON "community_post_like" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "community_post_like_user_id_idx" ON "community_post_like" USING btree ("user_id");