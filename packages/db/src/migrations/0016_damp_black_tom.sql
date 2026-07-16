CREATE TABLE "job_boost_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"boost_type" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_product" ADD COLUMN "manual_boosts_per_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "boosted_at" timestamp;--> statement-breakpoint
ALTER TABLE "job_boost_event" ADD CONSTRAINT "job_boost_event_job_post_id_job_post_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_boost_event" ADD CONSTRAINT "job_boost_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_boost_event" ADD CONSTRAINT "job_boost_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_boost_event_job_post_created_at_idx" ON "job_boost_event" USING btree ("job_post_id","created_at");--> statement-breakpoint
CREATE INDEX "job_boost_event_organization_id_idx" ON "job_boost_event" USING btree ("organization_id");