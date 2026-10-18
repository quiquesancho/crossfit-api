import { buildApp } from "./app.js";
import { createCatalogReader } from "./catalogs.js";
import { createDatabase } from "./db/client.js";

const databaseUrl = process.env.DATABASE_URL;
const app = buildApp(databaseUrl ? { catalogReader: createCatalogReader(createDatabase(databaseUrl)) } : undefined);

await app.listen({ host: "0.0.0.0", port: 3000 });
