ALTER TABLE "bambi_profile" ADD COLUMN "grade_anchor_grade_id" uuid;--> statement-breakpoint
ALTER TABLE "bambi_profile" ADD COLUMN "grade_anchor_basis_points" integer;--> statement-breakpoint
ALTER TABLE "bambi_profile" ADD COLUMN "grade_anchor_start_points" integer;--> statement-breakpoint
ALTER TABLE "bambi_profile" ADD COLUMN "grade_anchor_set_at" timestamp;--> statement-breakpoint
ALTER TABLE "bambi_profile" ADD CONSTRAINT "bambi_profile_grade_anchor_grade_id_bambi_member_grade_id_fk" FOREIGN KEY ("grade_anchor_grade_id") REFERENCES "public"."bambi_member_grade"("id") ON DELETE set null ON UPDATE no action;