CREATE TABLE "set_attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"block_execution_id" uuid NOT NULL,
	"planned_prescription_id" uuid,
	"position" integer NOT NULL,
	"movement_id" uuid,
	"complex_version_id" uuid,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_attempt_position_check" CHECK ("set_attempt"."position" > 0),
	CONSTRAINT "set_attempt_status_check" CHECK ("set_attempt"."status" in ('completed', 'partial', 'failed', 'skipped')),
	CONSTRAINT "set_attempt_reference_check" CHECK (num_nonnulls("set_attempt"."movement_id", "set_attempt"."complex_version_id") <= 1),
	CONSTRAINT "set_attempt_anchor_check" CHECK ("set_attempt"."planned_prescription_id" is not null or num_nonnulls("set_attempt"."movement_id", "set_attempt"."complex_version_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "typed_metric" DROP CONSTRAINT "typed_metric_metric_type_check";--> statement-breakpoint
ALTER TABLE "typed_metric" DROP CONSTRAINT "typed_metric_count_value_check";--> statement-breakpoint
ALTER TABLE "typed_metric" ALTER COLUMN "block_execution_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "typed_metric" ADD COLUMN "set_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "set_attempt" ADD CONSTRAINT "set_attempt_block_execution_id_block_execution_id_fk" FOREIGN KEY ("block_execution_id") REFERENCES "public"."block_execution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_attempt" ADD CONSTRAINT "set_attempt_planned_prescription_id_prescription_id_fk" FOREIGN KEY ("planned_prescription_id") REFERENCES "public"."prescription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_attempt" ADD CONSTRAINT "set_attempt_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_attempt" ADD CONSTRAINT "set_attempt_complex_version_id_complex_version_id_fk" FOREIGN KEY ("complex_version_id") REFERENCES "public"."complex_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "set_attempt_block_position_idx" ON "set_attempt" USING btree ("block_execution_id","position");--> statement-breakpoint
CREATE INDEX "set_attempt_block_execution_idx" ON "set_attempt" USING btree ("block_execution_id");--> statement-breakpoint
CREATE INDEX "set_attempt_planned_prescription_idx" ON "set_attempt" USING btree ("planned_prescription_id");--> statement-breakpoint
CREATE INDEX "set_attempt_movement_idx" ON "set_attempt" USING btree ("movement_id");--> statement-breakpoint
ALTER TABLE "typed_metric" ADD CONSTRAINT "typed_metric_set_attempt_id_set_attempt_id_fk" FOREIGN KEY ("set_attempt_id") REFERENCES "public"."set_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "typed_metric_set_attempt_idx" ON "typed_metric" USING btree ("set_attempt_id");--> statement-breakpoint
ALTER TABLE "typed_metric" ADD CONSTRAINT "typed_metric_scope_check" CHECK (num_nonnulls("typed_metric"."block_execution_id", "typed_metric"."set_attempt_id") = 1);--> statement-breakpoint
ALTER TABLE "typed_metric" ADD CONSTRAINT "typed_metric_metric_type_check" CHECK ("typed_metric"."metric_type" in ('rounds', 'extra-repetitions', 'repetitions', 'weight', 'load-status'));--> statement-breakpoint
ALTER TABLE "typed_metric" ADD CONSTRAINT "typed_metric_count_value_check" CHECK ("typed_metric"."metric_type" not in ('rounds', 'extra-repetitions', 'repetitions') or "typed_metric"."numeric_value" = trunc("typed_metric"."numeric_value"));