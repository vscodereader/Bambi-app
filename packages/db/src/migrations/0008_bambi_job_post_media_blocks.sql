CREATE TYPE "public"."job_post_media_usage" AS ENUM('cover', 'detail');--> statement-breakpoint
CREATE TABLE "job_post_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"usage" "job_post_media_usage" NOT NULL,
	"position" integer NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"alt_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_post" ADD COLUMN "description_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "job_post_media" ADD CONSTRAINT "job_post_media_job_post_id_job_post_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_post_media" ADD CONSTRAINT "job_post_media_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_post_media" ADD CONSTRAINT "job_post_media_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_post_media_job_post_id_idx" ON "job_post_media" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX "job_post_media_organization_id_idx" ON "job_post_media" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_post_media_usage_position_idx" ON "job_post_media" USING btree ("usage","position");--> statement-breakpoint
CREATE UNIQUE INDEX "job_post_media_storage_key_uidx" ON "job_post_media" USING btree ("storage_key");