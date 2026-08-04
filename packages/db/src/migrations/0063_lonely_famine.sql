ALTER TABLE "crawled_job_post" ADD COLUMN "edited_detail_image_document" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD COLUMN "detail_images_edited_at" timestamp;--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD COLUMN "detail_images_edited_by_user_id" text;--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD COLUMN "detail_image_edit_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crawled_job_post" ADD CONSTRAINT "crawled_job_post_detail_images_edited_by_user_id_user_id_fk" FOREIGN KEY ("detail_images_edited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;