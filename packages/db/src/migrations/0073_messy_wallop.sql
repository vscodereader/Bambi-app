CREATE TYPE "public"."main_popup_content_type" AS ENUM('image', 'text');--> statement-breakpoint
CREATE TABLE "main_popup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_index" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"content_type" "main_popup_content_type" DEFAULT 'image' NOT NULL,
	"original_image" jsonb,
	"edited_image" jsonb,
	"content_width" integer DEFAULT 420 NOT NULL,
	"content_height" integer DEFAULT 320 NOT NULL,
	"text_document" jsonb,
	"link_path" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main_popup" ADD CONSTRAINT "main_popup_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "main_popup_slot_index_uidx" ON "main_popup" USING btree ("slot_index");
