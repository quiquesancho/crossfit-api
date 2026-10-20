import { and, eq, inArray, isNull } from "drizzle-orm";

import { createExamplePlanningPublication, currentWeekStart } from "../modules/planning/planning.example.js";
import { createPlanningPublisher } from "../modules/planning/planning.publisher.js";
import { isIsoWeekStart } from "../modules/planning/planning.validation.js";
import { createDatabase } from "./client.js";
import { athlete, catalog, catalogEntry, movement } from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must be set to seed an example planning week.");

const database = createDatabase(connectionString);
const [profile] = await database
  .select({ timezone: athlete.timezone })
  .from(athlete)
  .where(and(eq(athlete.profileKey, "local"), eq(athlete.active, true)))
  .limit(1);
if (!profile) throw new Error("The local athlete profile must be seeded first.");

const blockTypes = await database
  .select({ id: catalogEntry.id, code: catalogEntry.code })
  .from(catalogEntry)
  .innerJoin(catalog, eq(catalogEntry.catalogId, catalog.id))
  .where(
    and(
      eq(catalog.key, "block-type"),
      eq(catalogEntry.active, true),
      isNull(catalogEntry.archivedAt),
      inArray(catalogEntry.code, ["warmup", "strength", "wod"]),
    ),
  );
const blockTypeByCode = new Map(blockTypes.map((entry) => [entry.code, entry.id]));
const [powerClean] = await database
  .select({ id: movement.id })
  .from(movement)
  .where(and(eq(movement.code, "power-clean"), isNull(movement.archivedAt)))
  .limit(1);

const warmupBlockTypeId = blockTypeByCode.get("warmup");
const strengthBlockTypeId = blockTypeByCode.get("strength");
const wodBlockTypeId = blockTypeByCode.get("wod");
if (!warmupBlockTypeId || !strengthBlockTypeId || !wodBlockTypeId || !powerClean) {
  throw new Error("The catalog seed must run before seeding the example planning week.");
}

const weekStart = process.env.PLANNING_EXAMPLE_WEEK_START ?? currentWeekStart(new Date(), profile.timezone);
if (!isIsoWeekStart(weekStart)) {
  throw new Error("PLANNING_EXAMPLE_WEEK_START must be a valid ISO date for a Monday.");
}
const publication = createExamplePlanningPublication(weekStart, {
  warmupBlockTypeId,
  strengthBlockTypeId,
  wodBlockTypeId,
  powerCleanMovementId: powerClean.id,
});
const result = await createPlanningPublisher(database).publish("example-plan", publication);
console.log(JSON.stringify({ weekStart, ...result }));
