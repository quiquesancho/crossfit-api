import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
