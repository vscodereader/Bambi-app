CREATE TABLE "bambi_identity_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"consumed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "bambi_identity_verification_issued_at_idx" ON "bambi_identity_verification" USING btree ("issued_at");