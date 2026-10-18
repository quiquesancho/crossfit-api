import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase } from "./client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set to run migrations.");
}

await migrate(createDatabase(connectionString), { migrationsFolder: "./drizzle" });
