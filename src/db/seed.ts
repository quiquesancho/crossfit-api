import { sql } from "drizzle-orm";

import { createDatabase } from "./client.js";
import { athlete, catalog, catalogEntry, movement, movementFamily } from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set to seed the database.");
}

const database = createDatabase(connectionString);
const athleteDisplayName = (process.env.ATHLETE_DISPLAY_NAME ?? "Atleta").trim();
const athleteTimezone = (process.env.ATHLETE_TIMEZONE ?? "Europe/Madrid").trim();

if (!athleteDisplayName || !athleteTimezone) {
  throw new Error("ATHLETE_DISPLAY_NAME and ATHLETE_TIMEZONE cannot be empty.");
}

await database
  .insert(athlete)
  .values({ profileKey: "local", displayName: athleteDisplayName, timezone: athleteTimezone })
  .onConflictDoUpdate({
    target: athlete.profileKey,
    set: {
      displayName: sql`excluded.display_name`,
      timezone: sql`excluded.timezone`,
      active: true,
      updatedAt: sql`now()`,
    },
  });

const [blockType] = await database
  .insert(catalog)
  .values({ key: "block-type", description: "Tipos de bloque de entrenamiento" })
  .onConflictDoUpdate({ target: catalog.key, set: { description: sql`excluded.description` } })
  .returning({ id: catalog.id });

if (!blockType) {
  throw new Error("Failed to seed the block-type catalog.");
}

await database
  .insert(catalogEntry)
  .values([
    { catalogId: blockType.id, code: "warmup", description: "Calentamiento", displayOrder: 1 },
    { catalogId: blockType.id, code: "technique", description: "Técnica", displayOrder: 2 },
    { catalogId: blockType.id, code: "strength", description: "Fuerza", displayOrder: 3 },
    { catalogId: blockType.id, code: "wod", description: "WOD", displayOrder: 4 },
  ])
  .onConflictDoUpdate({
    target: [catalogEntry.catalogId, catalogEntry.code],
    set: {
      description: sql`excluded.description`,
      displayOrder: sql`excluded.display_order`,
    },
  });

const [clean] = await database
  .insert(movementFamily)
  .values({ code: "clean", name: "Clean" })
  .onConflictDoUpdate({ target: movementFamily.code, set: { name: sql`excluded.name` } })
  .returning({ id: movementFamily.id });

if (!clean) {
  throw new Error("Failed to seed the clean movement family.");
}

await database
  .insert(movement)
  .values({ code: "power-clean", familyId: clean.id, name: "Power clean" })
  .onConflictDoUpdate({
    target: movement.code,
    set: { name: sql`excluded.name`, familyId: sql`excluded.family_id` },
  });
