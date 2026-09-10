CREATE TYPE "public"."user_presence_platform" AS ENUM('web', 'native');--> statement-breakpoint
CREATE TABLE "bambi_user_presence_connection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"platform" "user_presence_platform" NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_activity_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "presence_disconnected_at" timestamp;--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD COLUMN "user_offline_after_minutes" integer;--> statement-breakpoint
ALTER TABLE "bambi_user_presence_connection" ADD CONSTRAINT "bambi_user_presence_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_user_presence_connection" ADD CONSTRAINT "bambi_user_presence_connection_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_presence_connection_user_id_idx" ON "bambi_user_presence_connection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_presence_connection_session_id_idx" ON "bambi_user_presence_connection" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "user_presence_connection_lease_expires_at_idx" ON "bambi_user_presence_connection" USING btree ("lease_expires_at");--> statement-breakpoint
ALTER TABLE "bambi_site_settings" ADD CONSTRAINT "bambi_site_settings_user_offline_after_minutes_check" CHECK ("bambi_site_settings"."user_offline_after_minutes" IS NULL OR "bambi_site_settings"."user_offline_after_minutes" > 0);
--> statement-breakpoint
CREATE FUNCTION "notify_bambi_user_presence"() RETURNS trigger AS $$
BEGIN
	PERFORM pg_notify(
		'bambi_user_presence',
		json_build_object(
			'type', 'user',
			'userId', NEW."id",
			'lastActivityAt', CASE WHEN NEW."last_activity_at" IS NULL THEN NULL ELSE (extract(epoch FROM NEW."last_activity_at" AT TIME ZONE 'UTC') * 1000)::bigint END,
			'presenceDisconnectedAt', CASE WHEN NEW."presence_disconnected_at" IS NULL THEN NULL ELSE (extract(epoch FROM NEW."presence_disconnected_at" AT TIME ZONE 'UTC') * 1000)::bigint END,
			'deletedAt', CASE WHEN NEW."deleted_at" IS NULL THEN NULL ELSE (extract(epoch FROM NEW."deleted_at" AT TIME ZONE 'UTC') * 1000)::bigint END
		)::text
	);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "user_presence_changed"
AFTER UPDATE OF "last_activity_at", "presence_disconnected_at", "deleted_at" ON "user"
FOR EACH ROW
WHEN (
	OLD."last_activity_at" IS DISTINCT FROM NEW."last_activity_at"
	OR OLD."presence_disconnected_at" IS DISTINCT FROM NEW."presence_disconnected_at"
	OR OLD."deleted_at" IS DISTINCT FROM NEW."deleted_at"
)
EXECUTE FUNCTION "notify_bambi_user_presence"();
--> statement-breakpoint
CREATE FUNCTION "notify_bambi_presence_policy"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'INSERT' OR OLD."user_offline_after_minutes" IS DISTINCT FROM NEW."user_offline_after_minutes" THEN
		PERFORM pg_notify(
			'bambi_user_presence',
			json_build_object(
				'type', 'policy',
				'offlineAfterMinutes', NEW."user_offline_after_minutes"
			)::text
		);
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "bambi_presence_policy_changed"
AFTER INSERT OR UPDATE ON "bambi_site_settings"
FOR EACH ROW
EXECUTE FUNCTION "notify_bambi_presence_policy"();

