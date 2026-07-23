CREATE TYPE "public"."bambi_gender" AS ENUM('male', 'female');--> statement-breakpoint
ALTER TABLE "bambi_profile" ADD COLUMN "gender" "bambi_gender";