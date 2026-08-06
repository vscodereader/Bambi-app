CREATE TABLE "bambi_attendance" (
	"user_id" text NOT NULL,
	"attended_on" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bambi_attendance_user_id_attended_on_pk" PRIMARY KEY("user_id","attended_on")
);
--> statement-breakpoint
ALTER TABLE "bambi_attendance" ADD CONSTRAINT "bambi_attendance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bambi_attendance_attended_on_idx" ON "bambi_attendance" USING btree ("attended_on");