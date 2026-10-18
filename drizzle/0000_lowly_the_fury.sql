CREATE TABLE "catalog" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "catalog_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "catalog_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"catalog_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "movement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "movement_family" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_family_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "catalog_entry" ADD CONSTRAINT "catalog_entry_catalog_id_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_family_id_movement_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."movement_family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_entry_catalog_code_idx" ON "catalog_entry" USING btree ("catalog_id","code");