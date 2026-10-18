import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createDatabase } from "./db/client.js";
import { createCatalogReader } from "./modules/catalog/catalog.repository.js";

const config = loadConfig();
const app = buildApp(config.databaseUrl ? { catalogReader: createCatalogReader(createDatabase(config.databaseUrl)) } : undefined);

await app.listen({ host: config.host, port: config.port });
