CREATE TABLE "feeling" (
	"id" uuid PRIMARY KEY NOT NULL,
	"athlete_id" uuid NOT NULL,
	"session_execution_id" uuid,
	"block_execution_id" uuid,
	"rpe" smallint,
	"pain" smallint,
	"recovery_id" uuid,
	"technique_quality_id" uuid,
	"limitation_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feeling_scope_check" CHECK (num_nonnulls("feeling"."session_execution_id", "feeling"."block_execution_id") = 1),
	CONSTRAINT "feeling_rpe_check" CHECK ("feeling"."rpe" is null or "feeling"."rpe" between 1 and 10),
	CONSTRAINT "feeling_pain_check" CHECK ("feeling"."pain" is null or "feeling"."pain" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "substitution" (
	"id" uuid PRIMARY KEY NOT NULL,
	"block_execution_id" uuid NOT NULL,
	"planned_prescription_id" uuid NOT NULL,
	"actual_movement_id" uuid NOT NULL,
	"reason_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feeling" ADD CONSTRAINT "feeling_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeling" ADD CONSTRAINT "feeling_session_execution_id_session_execution_id_fk" FOREIGN KEY ("session_execution_id") REFERENCES "public"."session_execution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeling" ADD CONSTRAINT "feeling_block_execution_id_block_execution_id_fk" FOREIGN KEY ("block_execution_id") REFERENCES "public"."block_execution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeling" ADD CONSTRAINT "feeling_recovery_id_catalog_entry_id_fk" FOREIGN KEY ("recovery_id") REFERENCES "public"."catalog_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeling" ADD CONSTRAINT "feeling_technique_quality_id_catalog_entry_id_fk" FOREIGN KEY ("technique_quality_id") REFERENCES "public"."catalog_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeling" ADD CONSTRAINT "feeling_limitation_id_catalog_entry_id_fk" FOREIGN KEY ("limitation_id") REFERENCES "public"."catalog_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_block_execution_id_block_execution_id_fk" FOREIGN KEY ("block_execution_id") REFERENCES "public"."block_execution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_planned_prescription_id_prescription_id_fk" FOREIGN KEY ("planned_prescription_id") REFERENCES "public"."prescription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_actual_movement_id_movement_id_fk" FOREIGN KEY ("actual_movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_reason_id_catalog_entry_id_fk" FOREIGN KEY ("reason_id") REFERENCES "public"."catalog_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feeling_athlete_idx" ON "feeling" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "feeling_session_execution_idx" ON "feeling" USING btree ("session_execution_id");--> statement-breakpoint
CREATE INDEX "feeling_block_execution_idx" ON "feeling" USING btree ("block_execution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "substitution_block_prescription_idx" ON "substitution" USING btree ("block_execution_id","planned_prescription_id");--> statement-breakpoint
CREATE INDEX "substitution_block_execution_idx" ON "substitution" USING btree ("block_execution_id");--> statement-breakpoint
CREATE INDEX "substitution_actual_movement_idx" ON "substitution" USING btree ("actual_movement_id");