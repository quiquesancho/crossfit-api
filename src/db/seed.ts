import { createDatabase } from "./client.js";
import { catalog, catalogEntry, movement, movementFamily } from "./schema.js";

const ids = {
  blockType: "019b4e0a-0000-7000-8000-000000000001",
  warmup: "019b4e0a-0000-7000-8000-000000000002",
  strength: "019b4e0a-0000-7000-8000-000000000003",
  wod: "019b4e0a-0000-7000-8000-000000000004",
  clean: "019b4e0a-0000-7000-8000-000000000005",
  powerClean: "019b4e0a-0000-7000-8000-000000000006",
} as const;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set to seed the database.");
}

const database = createDatabase(connectionString);

await database.insert(catalog).values({ id: ids.blockType, key: "block-type", description: "Training block types" }).onConflictDoNothing();
await database
  .insert(catalogEntry)
  .values([
    { id: ids.warmup, catalogId: ids.blockType, code: "warmup", description: "Warm-up", displayOrder: 1 },
    { id: ids.strength, catalogId: ids.blockType, code: "strength", description: "Strength and technique", displayOrder: 2 },
    { id: ids.wod, catalogId: ids.blockType, code: "wod", description: "Workout of the day", displayOrder: 3 },
  ])
  .onConflictDoNothing();
await database.insert(movementFamily).values({ id: ids.clean, code: "clean", name: "Clean" }).onConflictDoNothing();
await database
  .insert(movement)
  .values({ id: ids.powerClean, code: "power-clean", familyId: ids.clean, name: "Power clean" })
  .onConflictDoNothing();
