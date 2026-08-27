ALTER TABLE "bambi_point_shop_product_type" ADD COLUMN "show_in_inventory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "bambi_point_shop_item"
SET "description" = replace("description", '¡', '!')
WHERE "description" LIKE '%¡%';
