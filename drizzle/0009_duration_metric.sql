ALTER TABLE "typed_metric" DROP CONSTRAINT "typed_metric_metric_type_check";--> statement-breakpoint
ALTER TABLE "typed_metric" DROP CONSTRAINT "typed_metric_unit_check";--> statement-breakpoint
ALTER TABLE "typed_metric" ADD CONSTRAINT "typed_metric_duration_value_check" CHECK ("typed_metric"."metric_type" <> 'duration' or "typed_metric"."numeric_value" > 0);--> statement-breakpoint
ALTER TABLE "typed_metric" ADD CONSTRAINT "typed_metric_metric_type_check" CHECK ("typed_metric"."metric_type" in ('rounds', 'extra-repetitions', 'repetitions', 'weight', 'load-status', 'duration'));--> statement-breakpoint
ALTER TABLE "typed_metric" ADD CONSTRAINT "typed_metric_unit_check" CHECK ("typed_metric"."unit" in ('count', 'kg', 'lb', 'status', 's'));