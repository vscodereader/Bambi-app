CREATE TYPE "public"."bambi_legal_consent_document" AS ENUM('terms_of_service', 'privacy_policy');--> statement-breakpoint
CREATE TABLE "bambi_legal_consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"document" "bambi_legal_consent_document" NOT NULL,
	"version" text NOT NULL,
	"agreed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bambi_legal_consent" ADD CONSTRAINT "bambi_legal_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_legal_consent_user_id_document_version_uidx" ON "bambi_legal_consent" USING btree ("user_id","document","version");--> statement-breakpoint
CREATE INDEX "bambi_legal_consent_user_id_idx" ON "bambi_legal_consent" USING btree ("user_id");