ALTER TABLE "bambi_profile" ADD COLUMN "ci_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_profile_ci_hash_unique" ON "bambi_profile" USING btree ("ci_hash");