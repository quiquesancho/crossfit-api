import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export function createDatabase(connectionString: string) {
  return drizzle(new Pool({ connectionString }), { schema });
}

export type Database = ReturnType<typeof createDatabase>;
