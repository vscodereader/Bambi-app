DO $$ BEGIN
	CREATE TYPE "public"."point_shop_audience" AS ENUM('all', 'employer', 'job_seeker');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."point_shop_benefit_type" AS ENUM('none', 'coupon', 'boost_manual_period', 'boost_manual_count', 'boost_auto_period', 'ad_extend');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TYPE "public"."job_boost_purchase_source" ADD VALUE IF NOT EXISTS 'point_shop';--> statement-breakpoint
ALTER TYPE "public"."notification_target_type" ADD VALUE IF NOT EXISTS 'point_shop_order';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bambi_point_shop_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_points" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"benefit_type" "point_shop_benefit_type" DEFAULT 'none' NOT NULL,
	"audience" "point_shop_audience" DEFAULT 'all' NOT NULL,
	"boosts_per_day" integer,
	"duration_days" integer,
	"boost_count" integer,
	"extend_days" integer,
	"usage_limit_days" integer,
	"stock_quantity" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bambi_point_shop_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid,
	"item_name" text NOT NULL,
	"price_points" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"operator_memo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"benefit_type" "point_shop_benefit_type" DEFAULT 'none' NOT NULL,
	"boosts_per_day" integer,
	"duration_days" integer,
	"boost_count" integer,
	"extend_days" integer,
	"usable_until" timestamp,
	"used_at" timestamp,
	"target_job_post_id" uuid,
	"expiry_notified_at" timestamp,
	"stock_decremented" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bambi_point_shop_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "bambi_point_shop_order_item_id_bambi_point_shop_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."bambi_point_shop_item"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "bambi_point_shop_order_target_job_post_id_job_post_id_fk" FOREIGN KEY ("target_job_post_id") REFERENCES "public"."job_post"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bambi_point_shop_order_user_id_idx" ON "bambi_point_shop_order" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bambi_point_shop_order_status_idx" ON "bambi_point_shop_order" USING btree ("status");--> statement-breakpoint
CREATE TYPE "public"."bambi_attendance_source" AS ENUM('check_in', 'restore_ticket');--> statement-breakpoint
CREATE TYPE "public"."bambi_member_item_reason" AS ENUM('attendance_streak', 'employer_review_retained', 'point_shop_purchase', 'draw_use', 'attendance_restore_use', 'admin_adjustment');--> statement-breakpoint
CREATE TYPE "public"."bambi_member_item_type" AS ENUM('draw_ticket', 'attendance_restore_ticket');--> statement-breakpoint
CREATE TYPE "public"."bambi_review_draw_reward_status" AS ENUM('pending', 'awarded', 'disqualified');--> statement-breakpoint
CREATE TYPE "public"."point_shop_category_kind" AS ENUM('featured', 'standard');--> statement-breakpoint
ALTER TYPE "public"."point_shop_benefit_type" ADD VALUE 'draw_ticket';--> statement-breakpoint
ALTER TYPE "public"."point_shop_benefit_type" ADD VALUE 'attendance_restore_ticket';--> statement-breakpoint
CREATE TABLE "bambi_attendance_streak_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"run_start_on" date NOT NULL,
	"run_end_on" date NOT NULL,
	"trigger_attended_on" date NOT NULL,
	"item_transaction_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bambi_member_item_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_type" "bambi_member_item_type" NOT NULL,
	"quantity" integer NOT NULL,
	"reason" "bambi_member_item_reason" NOT NULL,
	"external_key" text NOT NULL,
	"point_shop_order_id" uuid,
	"reference_type" text,
	"reference_id" text,
	"description" text,
	"balance_after" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bambi_member_item_transaction_quantity_nonzero_ck" CHECK ("bambi_member_item_transaction"."quantity" <> 0),
	CONSTRAINT "bambi_member_item_transaction_balance_nonnegative_ck" CHECK ("bambi_member_item_transaction"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bambi_point_draw" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"prize_id" uuid,
	"prize_points_snapshot" integer NOT NULL,
	"prize_weight_snapshot" integer NOT NULL,
	"awarded_points" integer NOT NULL,
	"ticket_transaction_id" uuid NOT NULL,
	"point_transaction_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bambi_point_draw_prize" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"points" integer NOT NULL,
	"weight" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bambi_point_draw_prize_points_positive_ck" CHECK ("bambi_point_draw_prize"."points" > 0),
	CONSTRAINT "bambi_point_draw_prize_weight_positive_ck" CHECK ("bambi_point_draw_prize"."weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "bambi_point_shop_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "point_shop_category_kind" DEFAULT 'standard' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bambi_point_shop_featured_item" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bambi_point_shop_layout_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position" integer NOT NULL,
	"category_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bambi_review_draw_reward" (
	"review_id" uuid PRIMARY KEY NOT NULL,
	"recipient_user_id" text NOT NULL,
	"eligible_at" timestamp NOT NULL,
	"status" "bambi_review_draw_reward_status" DEFAULT 'pending' NOT NULL,
	"disqualified_reason" text,
	"item_transaction_id" uuid,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bambi_attendance" ADD COLUMN "source" "bambi_attendance_source" DEFAULT 'check_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_attendance" ADD COLUMN "streak_reward_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_attendance" ALTER COLUMN "streak_reward_eligible" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "bambi_attendance" ADD COLUMN "restored_by_item_transaction_id" uuid;--> statement-breakpoint
INSERT INTO "bambi_point_shop_category" ("key", "name", "kind", "is_active") VALUES
	('featured', '인기상품', 'featured', true),
	('gift-card', '상품권', 'standard', true),
	('other', '기타 아이템', 'standard', true);--> statement-breakpoint
INSERT INTO "bambi_point_shop_layout_row" ("position", "category_id")
SELECT seed."position", category."id"
FROM (VALUES (0, 'featured'), (1, 'gift-card'), (2, 'other')) AS seed("position", "key")
INNER JOIN "bambi_point_shop_category" AS category ON category."key" = seed."key";--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD COLUMN "category_id" uuid;--> statement-breakpoint
UPDATE "bambi_point_shop_item"
SET "category_id" = (SELECT "id" FROM "bambi_point_shop_category" WHERE "key" = 'other')
WHERE "category_id" IS NULL;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_attendance_streak_claim" ADD CONSTRAINT "bambi_attendance_streak_claim_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_attendance_streak_claim" ADD CONSTRAINT "bambi_attendance_streak_claim_item_transaction_id_bambi_member_item_transaction_id_fk" FOREIGN KEY ("item_transaction_id") REFERENCES "public"."bambi_member_item_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_member_item_transaction" ADD CONSTRAINT "bambi_member_item_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_member_item_transaction" ADD CONSTRAINT "bambi_member_item_transaction_point_shop_order_id_bambi_point_shop_order_id_fk" FOREIGN KEY ("point_shop_order_id") REFERENCES "public"."bambi_point_shop_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_point_draw" ADD CONSTRAINT "bambi_point_draw_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_point_draw" ADD CONSTRAINT "bambi_point_draw_prize_id_bambi_point_draw_prize_id_fk" FOREIGN KEY ("prize_id") REFERENCES "public"."bambi_point_draw_prize"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_point_draw" ADD CONSTRAINT "bambi_point_draw_ticket_transaction_id_bambi_member_item_transaction_id_fk" FOREIGN KEY ("ticket_transaction_id") REFERENCES "public"."bambi_member_item_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_point_draw" ADD CONSTRAINT "bambi_point_draw_point_transaction_id_bambi_point_transaction_id_fk" FOREIGN KEY ("point_transaction_id") REFERENCES "public"."bambi_point_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_featured_item" ADD CONSTRAINT "bambi_point_shop_featured_item_item_id_bambi_point_shop_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."bambi_point_shop_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_layout_row" ADD CONSTRAINT "bambi_point_shop_layout_row_category_id_bambi_point_shop_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."bambi_point_shop_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_review_draw_reward" ADD CONSTRAINT "bambi_review_draw_reward_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_review_draw_reward" ADD CONSTRAINT "bambi_review_draw_reward_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_review_draw_reward" ADD CONSTRAINT "bambi_review_draw_reward_item_transaction_id_bambi_member_item_transaction_id_fk" FOREIGN KEY ("item_transaction_id") REFERENCES "public"."bambi_member_item_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bambi_attendance_streak_claim_user_run_idx" ON "bambi_attendance_streak_claim" USING btree ("user_id","run_start_on","run_end_on");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_attendance_streak_claim_item_transaction_uidx" ON "bambi_attendance_streak_claim" USING btree ("item_transaction_id");--> statement-breakpoint
CREATE INDEX "bambi_member_item_transaction_user_type_created_idx" ON "bambi_member_item_transaction" USING btree ("user_id","item_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_member_item_transaction_external_key_uidx" ON "bambi_member_item_transaction" USING btree ("external_key");--> statement-breakpoint
CREATE INDEX "bambi_member_item_transaction_order_id_idx" ON "bambi_member_item_transaction" USING btree ("point_shop_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_point_draw_user_request_uidx" ON "bambi_point_draw" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_point_draw_ticket_transaction_uidx" ON "bambi_point_draw" USING btree ("ticket_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_point_draw_point_transaction_uidx" ON "bambi_point_draw" USING btree ("point_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_point_shop_category_key_uidx" ON "bambi_point_shop_category" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_point_shop_featured_item_position_uidx" ON "bambi_point_shop_featured_item" USING btree ("position");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_point_shop_layout_row_position_uidx" ON "bambi_point_shop_layout_row" USING btree ("position");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_point_shop_layout_row_category_id_uidx" ON "bambi_point_shop_layout_row" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "bambi_review_draw_reward_status_eligible_idx" ON "bambi_review_draw_reward" USING btree ("status","eligible_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_review_draw_reward_item_transaction_uidx" ON "bambi_review_draw_reward" USING btree ("item_transaction_id");--> statement-breakpoint
ALTER TABLE "bambi_attendance" ADD CONSTRAINT "bambi_attendance_restored_by_item_transaction_id_bambi_member_item_transaction_id_fk" FOREIGN KEY ("restored_by_item_transaction_id") REFERENCES "public"."bambi_member_item_transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD CONSTRAINT "bambi_point_shop_item_category_id_bambi_point_shop_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."bambi_point_shop_category"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TYPE "public"."notification_target_type" ADD VALUE 'member_item_transaction';