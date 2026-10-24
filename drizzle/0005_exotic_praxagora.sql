CREATE TABLE "typed_metric" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"block_execution_id" uuid NOT NULL,
	"metric_type" text NOT NULL,
	"numeric_value" numeric(10, 3) NOT NULL,
	"unit" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "typed_metric_metric_type_check" CHECK ("typed_metric"."metric_type" in ('rounds', 'extra-repetitions', 'weight', 'load-status')),
	CONSTRAINT "typed_metric_unit_check" CHECK ("typed_metric"."unit" in ('count', 'kg', 'lb', 'status')),
	CONSTRAINT "typed_metric_numeric_value_check" CHECK ("typed_metric"."numeric_value" >= 0),
	CONSTRAINT "typed_metric_weight_value_check" CHECK ("typed_metric"."metric_type" <> 'weight' or "typed_metric"."numeric_value" > 0),
	CONSTRAINT "typed_metric_count_value_check" CHECK ("typed_metric"."metric_type" not in ('rounds', 'extra-repetitions') or "typed_metric"."numeric_value" = trunc("typed_metric"."numeric_value")),
	CONSTRAINT "typed_metric_status_value_check" CHECK ("typed_metric"."metric_type" <> 'load-status' or "typed_metric"."numeric_value" in (0, 1))
);
--> statement-breakpoint
ALTER TABLE "block_execution" ADD COLUMN "without_metrics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "typed_metric" ADD CONSTRAINT "typed_metric_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typed_metric" ADD CONSTRAINT "typed_metric_block_execution_id_block_execution_id_fk" FOREIGN KEY ("block_execution_id") REFERENCES "public"."block_execution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "typed_metric_athlete_type_idx" ON "typed_metric" USING btree ("athlete_id","metric_type");--> statement-breakpoint
CREATE INDEX "typed_metric_block_idx" ON "typed_metric" USING btree ("block_execution_id");