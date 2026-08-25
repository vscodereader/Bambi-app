DROP INDEX "bambi_comment_milestone_award_user_milestone_uidx";--> statement-breakpoint
ALTER TABLE "bambi_comment_milestone_award" ADD COLUMN "comment_id" uuid;--> statement-breakpoint
ALTER TABLE "bambi_comment_milestone_award" ADD CONSTRAINT "bambi_comment_milestone_award_comment_id_community_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."community_comment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_comment_milestone_award_milestone_uidx" ON "bambi_comment_milestone_award" USING btree ("milestone_id");