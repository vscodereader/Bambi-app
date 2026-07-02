CREATE TYPE "public"."job_performance_event_type" AS ENUM('impression', 'detail_view', 'chat_start', 'contact_reveal');--> statement-breakpoint
CREATE TABLE "job_performance_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"event_type" "job_performance_event_type" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_performance_event" ADD CONSTRAINT "job_performance_event_job_post_id_job_post_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_performance_event" ADD CONSTRAINT "job_performance_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_performance_event" ADD CONSTRAINT "job_performance_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_performance_event_job_post_id_idx" ON "job_performance_event" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX "job_performance_event_organization_id_idx" ON "job_performance_event" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_performance_event_type_created_at_idx" ON "job_performance_event" USING btree ("event_type","created_at");