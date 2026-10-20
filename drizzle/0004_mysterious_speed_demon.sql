CREATE TABLE "block_execution" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_execution_id" uuid NOT NULL,
	"planned_block_id" uuid,
	"position" integer NOT NULL,
	"block_type_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	CONSTRAINT "block_execution_position_check" CHECK ("block_execution"."position" > 0),
	CONSTRAINT "block_execution_status_check" CHECK ("block_execution"."status" in ('draft', 'completed', 'completed_without_metric', 'partial', 'skipped', 'abandoned'))
);
--> statement-breakpoint
CREATE TABLE "session_execution" (
	"id" uuid PRIMARY KEY NOT NULL,
	"athlete_id" uuid NOT NULL,
	"planned_session_id" uuid,
	"execution_date" date NOT NULL,
	"status" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"content_hash" text NOT NULL,
	"general_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"annulled_at" timestamp with time zone,
	CONSTRAINT "session_execution_status_check" CHECK ("session_execution"."status" in ('draft', 'completed', 'annulled')),
	CONSTRAINT "session_execution_revision_check" CHECK ("session_execution"."revision" > 0),
	CONSTRAINT "session_execution_annulled_at_check" CHECK (("session_execution"."status" = 'annulled') = ("session_execution"."annulled_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "block_execution" ADD CONSTRAINT "block_execution_session_execution_id_session_execution_id_fk" FOREIGN KEY ("session_execution_id") REFERENCES "public"."session_execution"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_execution" ADD CONSTRAINT "block_execution_planned_block_id_planned_block_id_fk" FOREIGN KEY ("planned_block_id") REFERENCES "public"."planned_block"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_execution" ADD CONSTRAINT "block_execution_block_type_id_catalog_entry_id_fk" FOREIGN KEY ("block_type_id") REFERENCES "public"."catalog_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_execution" ADD CONSTRAINT "session_execution_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_execution" ADD CONSTRAINT "session_execution_planned_session_id_planned_session_id_fk" FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "block_execution_session_position_idx" ON "block_execution" USING btree ("session_execution_id","position");--> statement-breakpoint
CREATE INDEX "block_execution_planned_block_idx" ON "block_execution" USING btree ("planned_block_id");--> statement-breakpoint
CREATE INDEX "session_execution_athlete_date_idx" ON "session_execution" USING btree ("athlete_id","execution_date");--> statement-breakpoint
CREATE INDEX "session_execution_planned_session_idx" ON "session_execution" USING btree ("planned_session_id");