CREATE TABLE "bambi_point_shop_product_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD COLUMN "product_type_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "bambi_point_shop_product_type_name_uidx" ON "bambi_point_shop_product_type" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "bambi_point_shop_item" ADD CONSTRAINT "bambi_point_shop_item_product_type_id_bambi_point_shop_product_type_id_fk" FOREIGN KEY ("product_type_id") REFERENCES "public"."bambi_point_shop_product_type"("id") ON DELETE set null ON UPDATE no action;