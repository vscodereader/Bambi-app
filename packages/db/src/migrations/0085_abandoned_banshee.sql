ALTER TYPE "public"."employer_verification_status" ADD VALUE 'changes_unsubmitted';--> statement-breakpoint
ALTER TABLE "employer_organization_profile" ADD COLUMN "draft_display_name" text;--> statement-breakpoint
ALTER TABLE "employer_organization_profile" ADD COLUMN "draft_business_registration_number" text;--> statement-breakpoint
ALTER TABLE "employer_organization_profile" ADD COLUMN "draft_representative_name" text;--> statement-breakpoint
ALTER TABLE "employer_organization_profile" ADD COLUMN "draft_business_start_date" text;