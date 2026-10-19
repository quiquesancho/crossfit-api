import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const athlete = pgTable("athlete", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileKey: text("profile_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  timezone: text("timezone").notNull().default("Europe/Madrid"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const catalog = pgTable("catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  description: text("description").notNull(),
});

export const catalogEntry = pgTable(
  "catalog_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogId: uuid("catalog_id").notNull().references(() => catalog.id),
    code: text("code").notNull(),
    description: text("description").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    displayOrder: integer("display_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("catalog_entry_catalog_code_idx").on(table.catalogId, table.code)],
);

export const movementFamily = pgTable("movement_family", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const movement = pgTable("movement", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  familyId: uuid("family_id").notNull().references(() => movementFamily.id),
  name: text("name").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const complex = pgTable("complex", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const complexVersion = pgTable(
  "complex_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    complexId: uuid("complex_id").notNull().references(() => complex.id),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("complex_version_complex_number_idx").on(table.complexId, table.versionNumber),
    check("complex_version_number_check", sql`${table.versionNumber} > 0`),
    check("complex_version_status_check", sql`${table.status} in ('draft', 'published', 'archived')`),
  ],
);

export const complexStep = pgTable(
  "complex_step",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    complexVersionId: uuid("complex_version_id").notNull().references(() => complexVersion.id),
    position: integer("position").notNull(),
    movementId: uuid("movement_id").notNull().references(() => movement.id),
    repetitions: integer("repetitions").notNull(),
  },
  (table) => [
    uniqueIndex("complex_step_version_position_idx").on(table.complexVersionId, table.position),
    check("complex_step_position_check", sql`${table.position} > 0`),
    check("complex_step_repetitions_check", sql`${table.repetitions} > 0`),
  ],
);

export const trainingPlan = pgTable(
  "training_plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAthleteId: uuid("owner_athlete_id").notNull().references(() => athlete.id),
    externalSource: text("external_source"),
    externalId: text("external_id"),
    title: text("title").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("training_plan_owner_idx").on(table.ownerAthleteId),
    uniqueIndex("training_plan_external_source_id_idx")
      .on(table.ownerAthleteId, table.externalSource, table.externalId)
      .where(sql`${table.externalSource} is not null and ${table.externalId} is not null`),
  ],
);

export const planVersion = pgTable(
  "plan_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainingPlanId: uuid("training_plan_id").notNull().references(() => trainingPlan.id),
    versionNumber: integer("version_number").notNull(),
    sourceVersion: text("source_version"),
    sourceHash: text("source_hash"),
    status: text("status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("plan_version_plan_number_idx").on(table.trainingPlanId, table.versionNumber),
    uniqueIndex("plan_version_plan_source_idx")
      .on(table.trainingPlanId, table.sourceVersion)
      .where(sql`${table.sourceVersion} is not null`),
    check("plan_version_number_check", sql`${table.versionNumber} > 0`),
    check("plan_version_status_check", sql`${table.status} in ('draft', 'published', 'archived')`),
  ],
);

export const plannedWeek = pgTable(
  "planned_week",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planVersionId: uuid("plan_version_id").notNull().references(() => planVersion.id),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    position: integer("position").notNull(),
    title: text("title"),
    priorities: text("priorities"),
  },
  (table) => [
    uniqueIndex("planned_week_version_position_idx").on(table.planVersionId, table.position),
    uniqueIndex("planned_week_version_start_idx").on(table.planVersionId, table.weekStart),
    check("planned_week_position_check", sql`${table.position} > 0`),
  ],
);

export const plannedSession = pgTable(
  "planned_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plannedWeekId: uuid("planned_week_id").notNull().references(() => plannedWeek.id),
    externalId: text("external_id"),
    plannedDate: date("planned_date", { mode: "string" }).notNull(),
    title: text("title").notNull(),
    objective: text("objective"),
    durationSeconds: integer("duration_seconds"),
    targetRpe: smallint("target_rpe"),
  },
  (table) => [
    index("planned_session_date_idx").on(table.plannedDate),
    uniqueIndex("planned_session_week_external_idx")
      .on(table.plannedWeekId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    check("planned_session_duration_check", sql`${table.durationSeconds} is null or ${table.durationSeconds} > 0`),
    check("planned_session_target_rpe_check", sql`${table.targetRpe} is null or ${table.targetRpe} between 1 and 10`),
  ],
);

export const plannedBlock = pgTable(
  "planned_block",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plannedSessionId: uuid("planned_session_id").notNull().references(() => plannedSession.id),
    position: integer("position").notNull(),
    blockTypeId: uuid("block_type_id").notNull().references(() => catalogEntry.id),
    title: text("title").notNull(),
    instructions: text("instructions"),
    durationSeconds: integer("duration_seconds"),
    targetRpe: smallint("target_rpe"),
  },
  (table) => [
    uniqueIndex("planned_block_session_position_idx").on(table.plannedSessionId, table.position),
    check("planned_block_position_check", sql`${table.position} > 0`),
    check("planned_block_duration_check", sql`${table.durationSeconds} is null or ${table.durationSeconds} > 0`),
    check("planned_block_target_rpe_check", sql`${table.targetRpe} is null or ${table.targetRpe} between 1 and 10`),
  ],
);

export const prescription = pgTable(
  "prescription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plannedBlockId: uuid("planned_block_id").notNull().references(() => plannedBlock.id),
    position: integer("position").notNull(),
    movementId: uuid("movement_id").references(() => movement.id),
    complexVersionId: uuid("complex_version_id").references(() => complexVersion.id),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("prescription_block_position_idx").on(table.plannedBlockId, table.position),
    check("prescription_position_check", sql`${table.position} > 0`),
    check(
      "prescription_reference_check",
      sql`num_nonnulls(${table.movementId}, ${table.complexVersionId}) <= 1`,
    ),
  ],
);
