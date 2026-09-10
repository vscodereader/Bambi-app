CREATE TABLE "chat_response_activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_response_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chat_room_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"activity_key" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"prompt_started_at" timestamp,
	"response_seconds" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_response_activity_response_nonnegative_ck" CHECK ("chat_response_activity"."response_seconds" IS NULL OR "chat_response_activity"."response_seconds" >= 0),
	CONSTRAINT "chat_response_activity_prompt_response_pair_ck" CHECK (("chat_response_activity"."prompt_started_at" IS NULL) = ("chat_response_activity"."response_seconds" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "chat_response_activity" ADD CONSTRAINT "chat_response_activity_chat_room_id_chat_room_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_response_activity" ADD CONSTRAINT "chat_response_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_response_activity_activity_key_uidx" ON "chat_response_activity" USING btree ("activity_key");--> statement-breakpoint
CREATE INDEX "chat_response_activity_chat_room_id_id_idx" ON "chat_response_activity" USING btree ("chat_room_id","id");--> statement-breakpoint
CREATE INDEX "chat_response_activity_actor_occurred_at_idx" ON "chat_response_activity" USING btree ("actor_user_id","occurred_at");
