CREATE TABLE "bambi_site_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"footer_intro" text,
	"operator" text,
	"ceo" text,
	"biz_reg_no" text,
	"address" text,
	"email" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
