CREATE TABLE "job_view_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_post_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"job_title" text NOT NULL,
	"organization_name" text NOT NULL,
	"view_count" integer DEFAULT 1 NOT NULL,
	"first_viewed_at" timestamp DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_view_log" ADD CONSTRAINT "job_view_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_view_log_user_job_uidx" ON "job_view_log" USING btree ("user_id","job_post_id");--> statement-breakpoint
CREATE INDEX "job_view_log_user_last_viewed_idx" ON "job_view_log" USING btree ("user_id","last_viewed_at");--> statement-breakpoint
CREATE INDEX "job_view_log_organization_id_idx" ON "job_view_log" USING btree ("organization_id");