CREATE TYPE "public"."community_board_layout_surface" AS ENUM('main', 'community');--> statement-breakpoint
DROP INDEX "community_board_home_layout_row_position_uidx";--> statement-breakpoint
ALTER TABLE "community_board_home_layout" ADD COLUMN "surface" "community_board_layout_surface";--> statement-breakpoint
UPDATE "community_board_home_layout" SET "surface" = 'community';--> statement-breakpoint
ALTER TABLE "community_board_home_layout" ALTER COLUMN "surface" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "community_board_home_layout" DROP CONSTRAINT "community_board_home_layout_pkey";--> statement-breakpoint
ALTER TABLE "community_board_home_layout" ADD CONSTRAINT "community_board_home_layout_surface_board_key_pk" PRIMARY KEY("surface","board_key");--> statement-breakpoint
INSERT INTO "community_board_home_layout" ("board_key", "row_index", "position", "surface", "updated_at")
SELECT "board_key", "row_index", "position", 'main', "updated_at"
FROM "community_board_home_layout"
WHERE "surface" = 'community';--> statement-breakpoint
CREATE UNIQUE INDEX "community_board_home_layout_row_position_uidx" ON "community_board_home_layout" USING btree ("surface","row_index","position");
