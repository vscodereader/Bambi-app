CREATE TABLE "bambi_identity_verification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_verification_id" text NOT NULL,
	"phone_number" text,
	"birth_date" varchar(8) NOT NULL,
	"gender" "bambi_gender",
	"kind" "bambi_user_role",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_identity_verification_log_iv_id_uidx" ON "bambi_identity_verification_log" USING btree ("identity_verification_id");