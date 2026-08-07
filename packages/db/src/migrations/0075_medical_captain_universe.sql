CREATE TABLE "employer_business_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"category" "chat_attachment_category" NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employer_business_document" ADD CONSTRAINT "employer_business_document_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_business_document" ADD CONSTRAINT "employer_business_document_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employer_business_document_organization_id_idx" ON "employer_business_document" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "employer_business_document_created_by_user_id_idx" ON "employer_business_document" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employer_business_document_storage_key_uidx" ON "employer_business_document" USING btree ("storage_key");