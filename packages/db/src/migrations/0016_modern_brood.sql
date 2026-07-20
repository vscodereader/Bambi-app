CREATE TYPE "public"."community_board" AS ENUM('free', 'work_talk', 'market', 'notice');--> statement-breakpoint
CREATE TYPE "public"."community_content_status" AS ENUM('published', 'hidden', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."support_inquiry_category" AS ENUM('account', 'job_post', 'payment', 'report', 'etc');--> statement-breakpoint
CREATE TYPE "public"."support_inquiry_status" AS ENUM('open', 'answered', 'closed');--> statement-breakpoint
ALTER TYPE "public"."moderation_target_type" ADD VALUE 'community_post' BEFORE 'team_invitation';--> statement-breakpoint
ALTER TYPE "public"."moderation_target_type" ADD VALUE 'community_comment' BEFORE 'team_invitation';--> statement-breakpoint
ALTER TYPE "public"."moderation_target_type" ADD VALUE 'support_inquiry' BEFORE 'team_invitation';--> statement-breakpoint
ALTER TYPE "public"."moderation_target_type" ADD VALUE 'support_inquiry_message' BEFORE 'team_invitation';--> statement-breakpoint
CREATE TABLE "banned_word" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"normalized_term" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"author_role" "bambi_user_role" NOT NULL,
	"parent_comment_id" uuid,
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
	"author_display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"author_role" "bambi_user_role" NOT NULL,
	"is_promotion" boolean DEFAULT false NOT NULL,
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
CREATE TABLE "faq_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "support_inquiry_category" NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_inquiry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" text NOT NULL,
	"author_role" "bambi_user_role" NOT NULL,
	"category" "support_inquiry_category" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"inquiry_status" "support_inquiry_status" DEFAULT 'open' NOT NULL,
	"status" "community_content_status" DEFAULT 'published' NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_inquiry_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"is_staff" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"status" "community_content_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "banned_word" ADD CONSTRAINT "banned_word_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment" ADD CONSTRAINT "community_comment_post_id_community_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment" ADD CONSTRAINT "community_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment" ADD CONSTRAINT "community_comment_parent_comment_id_community_comment_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."community_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_like" ADD CONSTRAINT "community_post_like_post_id_community_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_like" ADD CONSTRAINT "community_post_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_inquiry" ADD CONSTRAINT "support_inquiry_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_inquiry_message" ADD CONSTRAINT "support_inquiry_message_inquiry_id_support_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."support_inquiry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_inquiry_message" ADD CONSTRAINT "support_inquiry_message_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "banned_word_normalized_term_uidx" ON "banned_word" USING btree ("normalized_term");--> statement-breakpoint
CREATE INDEX "banned_word_is_active_idx" ON "banned_word" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "community_comment_post_id_status_created_at_idx" ON "community_comment" USING btree ("post_id","status","created_at");--> statement-breakpoint
CREATE INDEX "community_comment_author_user_id_idx" ON "community_comment" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "community_comment_parent_comment_id_idx" ON "community_comment" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "community_post_board_status_created_at_idx" ON "community_post" USING btree ("board","status","created_at");--> statement-breakpoint
CREATE INDEX "community_post_status_created_at_idx" ON "community_post" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "community_post_author_user_id_idx" ON "community_post" USING btree ("author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_post_like_post_id_user_id_uidx" ON "community_post_like" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "community_post_like_user_id_idx" ON "community_post_like" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "faq_entry_is_published_sort_order_idx" ON "faq_entry" USING btree ("is_published","sort_order");--> statement-breakpoint
CREATE INDEX "support_inquiry_author_user_id_created_at_idx" ON "support_inquiry" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_inquiry_inquiry_status_last_message_at_idx" ON "support_inquiry" USING btree ("inquiry_status","last_message_at");--> statement-breakpoint
CREATE INDEX "support_inquiry_status_created_at_idx" ON "support_inquiry" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "support_inquiry_message_inquiry_id_created_at_idx" ON "support_inquiry_message" USING btree ("inquiry_id","created_at");