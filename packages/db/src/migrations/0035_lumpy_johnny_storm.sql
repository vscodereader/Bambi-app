ALTER TABLE "user" ADD COLUMN "login_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "login_id_display" text;--> statement-breakpoint
ALTER TABLE "bambi_profile" DROP COLUMN "display_name";--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_login_id_unique" UNIQUE("login_id");