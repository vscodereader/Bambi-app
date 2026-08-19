CREATE TABLE "bambi_point_shop_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_points" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bambi_point_shop_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid,
	"item_name" text NOT NULL,
	"price_points" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"operator_memo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD CONSTRAINT "bambi_point_shop_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bambi_point_shop_order" ADD CONSTRAINT "bambi_point_shop_order_item_id_bambi_point_shop_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."bambi_point_shop_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bambi_point_shop_order_user_id_idx" ON "bambi_point_shop_order" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bambi_point_shop_order_status_idx" ON "bambi_point_shop_order" USING btree ("status");