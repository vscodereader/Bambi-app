CREATE TYPE "public"."job_boost_option_type" AS ENUM('manual_period', 'manual_count', 'auto_period');--> statement-breakpoint
CREATE TABLE "job_boost_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_type" "job_boost_option_type" NOT NULL,
	"price" integer,
	"boosts_per_day" integer,
	"duration_days" integer,
	"boost_count" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_boost_option_option_type_unique" UNIQUE("option_type")
);
--> statement-breakpoint
CREATE TABLE "job_boost_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"buyer_user_id" text,
	"option_type" "job_boost_option_type" NOT NULL,
	"amount" integer NOT NULL,
	"boosts_per_day" integer,
	"duration_days" integer,
	"boost_count" integer,
	"payment_method" "job_payment_method",
	"payment_status" "job_payment_status" DEFAULT 'unpaid' NOT NULL,
	"activated_at" timestamp,
	"expires_at" timestamp,
	"remaining_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_boost_event" ADD COLUMN "purchase_id" uuid;--> statement-breakpoint
ALTER TABLE "job_boost_purchase" ADD CONSTRAINT "job_boost_purchase_job_post_id_job_post_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_boost_purchase" ADD CONSTRAINT "job_boost_purchase_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_boost_purchase" ADD CONSTRAINT "job_boost_purchase_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_boost_purchase_job_post_id_idx" ON "job_boost_purchase" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX "job_boost_purchase_payment_status_idx" ON "job_boost_purchase" USING btree ("payment_status");--> statement-breakpoint
ALTER TABLE "job_boost_event" ADD CONSTRAINT "job_boost_event_purchase_id_job_boost_purchase_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."job_boost_purchase"("id") ON DELETE set null ON UPDATE no action;