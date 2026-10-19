CREATE TABLE "complex" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complex_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "complex_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complex_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"movement_id" uuid NOT NULL,
	"repetitions" integer NOT NULL,
	CONSTRAINT "complex_step_position_check" CHECK ("complex_step"."position" > 0),
	CONSTRAINT "complex_step_repetitions_check" CHECK ("complex_step"."repetitions" > 0)
);
--> statement-breakpoint
CREATE TABLE "complex_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complex_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complex_version_number_check" CHECK ("complex_version"."version_number" > 0),
	CONSTRAINT "complex_version_status_check" CHECK ("complex_version"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "plan_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_plan_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"source_version" text,
	"source_hash" text,
	"status" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_version_number_check" CHECK ("plan_version"."version_number" > 0),
	CONSTRAINT "plan_version_status_check" CHECK ("plan_version"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "planned_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planned_session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"block_type_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"duration_seconds" integer,
	"target_rpe" smallint,
	CONSTRAINT "planned_block_position_check" CHECK ("planned_block"."position" > 0),
	CONSTRAINT "planned_block_duration_check" CHECK ("planned_block"."duration_seconds" is null or "planned_block"."duration_seconds" > 0),
	CONSTRAINT "planned_block_target_rpe_check" CHECK ("planned_block"."target_rpe" is null or "planned_block"."target_rpe" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "planned_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planned_week_id" uuid NOT NULL,
	"external_id" text,
	"planned_date" date NOT NULL,
	"title" text NOT NULL,
	"objective" text,
	"duration_seconds" integer,
	"target_rpe" smallint,
	CONSTRAINT "planned_session_duration_check" CHECK ("planned_session"."duration_seconds" is null or "planned_session"."duration_seconds" > 0),
	CONSTRAINT "planned_session_target_rpe_check" CHECK ("planned_session"."target_rpe" is null or "planned_session"."target_rpe" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "planned_week" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"position" integer NOT NULL,
	"title" text,
	"priorities" text,
	CONSTRAINT "planned_week_position_check" CHECK ("planned_week"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "prescription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planned_block_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"movement_id" uuid,
	"complex_version_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	CONSTRAINT "prescription_position_check" CHECK ("prescription"."position" > 0),
	CONSTRAINT "prescription_reference_check" CHECK (num_nonnulls("prescription"."movement_id", "prescription"."complex_version_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "training_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_athlete_id" uuid NOT NULL,
	"external_source" text,
	"external_id" text,
	"title" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complex_step" ADD CONSTRAINT "complex_step_complex_version_id_complex_version_id_fk" FOREIGN KEY ("complex_version_id") REFERENCES "public"."complex_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complex_step" ADD CONSTRAINT "complex_step_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complex_version" ADD CONSTRAINT "complex_version_complex_id_complex_id_fk" FOREIGN KEY ("complex_id") REFERENCES "public"."complex"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_version" ADD CONSTRAINT "plan_version_training_plan_id_training_plan_id_fk" FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_block" ADD CONSTRAINT "planned_block_planned_session_id_planned_session_id_fk" FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_block" ADD CONSTRAINT "planned_block_block_type_id_catalog_entry_id_fk" FOREIGN KEY ("block_type_id") REFERENCES "public"."catalog_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_session" ADD CONSTRAINT "planned_session_planned_week_id_planned_week_id_fk" FOREIGN KEY ("planned_week_id") REFERENCES "public"."planned_week"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_week" ADD CONSTRAINT "planned_week_plan_version_id_plan_version_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_planned_block_id_planned_block_id_fk" FOREIGN KEY ("planned_block_id") REFERENCES "public"."planned_block"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_complex_version_id_complex_version_id_fk" FOREIGN KEY ("complex_version_id") REFERENCES "public"."complex_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan" ADD CONSTRAINT "training_plan_owner_athlete_id_athlete_id_fk" FOREIGN KEY ("owner_athlete_id") REFERENCES "public"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "complex_step_version_position_idx" ON "complex_step" USING btree ("complex_version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "complex_version_complex_number_idx" ON "complex_version" USING btree ("complex_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_version_plan_number_idx" ON "plan_version" USING btree ("training_plan_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_version_plan_source_idx" ON "plan_version" USING btree ("training_plan_id","source_version") WHERE "plan_version"."source_version" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "planned_block_session_position_idx" ON "planned_block" USING btree ("planned_session_id","position");--> statement-breakpoint
CREATE INDEX "planned_session_date_idx" ON "planned_session" USING btree ("planned_date");--> statement-breakpoint
CREATE UNIQUE INDEX "planned_session_week_external_idx" ON "planned_session" USING btree ("planned_week_id","external_id") WHERE "planned_session"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "planned_week_version_position_idx" ON "planned_week" USING btree ("plan_version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "planned_week_version_start_idx" ON "planned_week" USING btree ("plan_version_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "prescription_block_position_idx" ON "prescription" USING btree ("planned_block_id","position");--> statement-breakpoint
CREATE INDEX "training_plan_owner_idx" ON "training_plan" USING btree ("owner_athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plan_external_source_id_idx" ON "training_plan" USING btree ("owner_athlete_id","external_source","external_id") WHERE "training_plan"."external_source" is not null and "training_plan"."external_id" is not null;