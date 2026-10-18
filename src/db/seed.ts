import { sql } from "drizzle-orm";

import { createDatabase } from "./client.js";
import { catalog, catalogEntry, movement, movementFamily } from "./schema.js";

const ids = {
  blockType: "019b4e0a-0000-7000-8000-000000000001",
  warmup: "019b4e0a-0000-7000-8000-000000000002",
  strength: "019b4e0a-0000-7000-8000-000000000003",
  technique: "019b4e0a-0000-7000-8000-000000000007",
  wod: "019b4e0a-0000-7000-8000-000000000004",
  clean: "019b4e0a-0000-7000-8000-000000000005",
  powerClean: "019b4e0a-0000-7000-8000-000000000006",
} as const;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set to seed the database.");
}

const database = createDatabase(connectionString);

await database
  .insert(catalog)
  .values({ id: ids.blockType, key: "block-type", description: "Tipos de bloque de entrenamiento" })
  .onConflictDoUpdate({ target: catalog.id, set: { description: sql`excluded.description` } });
await database
  .insert(catalogEntry)
  .values([
    { id: ids.warmup, catalogId: ids.blockType, code: "warmup", description: "Calentamiento", displayOrder: 1 },
    { id: ids.technique, catalogId: ids.blockType, code: "technique", description: "Técnica", displayOrder: 2 },
    { id: ids.strength, catalogId: ids.blockType, code: "strength", description: "Fuerza", displayOrder: 3 },
    { id: ids.wod, catalogId: ids.blockType, code: "wod", description: "WOD", displayOrder: 4 },
  ])
  .onConflictDoUpdate({
    target: catalogEntry.id,
    set: {
      code: sql`excluded.code`,
      description: sql`excluded.description`,
      displayOrder: sql`excluded.display_order`,
    },
  });
await database.insert(movementFamily).values({ id: ids.clean, code: "clean", name: "Clean" }).onConflictDoNothing();
await database
  .insert(movement)
  .values({ id: ids.powerClean, code: "power-clean", familyId: ids.clean, name: "Power clean" })
  .onConflictDoNothing();
