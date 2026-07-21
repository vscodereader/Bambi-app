ALTER TABLE "bambi_profile" ADD COLUMN "di_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_profile_di_hash_unique" ON "bambi_profile" USING btree ("di_hash");