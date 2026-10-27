CREATE TABLE "personal_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"set_attempt_id" uuid,
	"movement_id" uuid,
	"complex_version_id" uuid,
	"repetitions" integer NOT NULL,
	"load_kg" numeric(10, 3) NOT NULL,
	"achieved_on" date NOT NULL,
	"status" text NOT NULL,
	"source_type" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_record_anchor_check" CHECK (num_nonnulls("personal_record"."movement_id", "personal_record"."complex_version_id") = 1),
	CONSTRAINT "personal_record_repetitions_check" CHECK ("personal_record"."repetitions" > 0),
	CONSTRAINT "personal_record_load_check" CHECK ("personal_record"."load_kg" >= 0),
	CONSTRAINT "personal_record_status_check" CHECK ("personal_record"."status" in ('suggested', 'confirmed', 'discarded')),
	CONSTRAINT "personal_record_source_check" CHECK ("personal_record"."source_type" in ('attempt', 'manual_historical')),
	CONSTRAINT "personal_record_confirmed_at_check" CHECK (("personal_record"."status" = 'confirmed') = ("personal_record"."confirmed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "personal_record" ADD CONSTRAINT "personal_record_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_record" ADD CONSTRAINT "personal_record_set_attempt_id_set_attempt_id_fk" FOREIGN KEY ("set_attempt_id") REFERENCES "public"."set_attempt"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_record" ADD CONSTRAINT "personal_record_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_record" ADD CONSTRAINT "personal_record_complex_version_id_complex_version_id_fk" FOREIGN KEY ("complex_version_id") REFERENCES "public"."complex_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_record_attempt_idx" ON "personal_record" USING btree ("set_attempt_id") WHERE "personal_record"."set_attempt_id" is not null;--> statement-breakpoint
CREATE INDEX "personal_record_athlete_status_idx" ON "personal_record" USING btree ("athlete_id","status");--> statement-breakpoint
CREATE INDEX "personal_record_athlete_movement_idx" ON "personal_record" USING btree ("athlete_id","movement_id","repetitions");--> statement-breakpoint
CREATE INDEX "personal_record_athlete_complex_idx" ON "personal_record" USING btree ("athlete_id","complex_version_id","repetitions");--> statement-breakpoint
CREATE INDEX "personal_record_athlete_date_idx" ON "personal_record" USING btree ("athlete_id","achieved_on");