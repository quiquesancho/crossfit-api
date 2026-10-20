import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createDatabase } from "./db/client.js";
import { createCatalogReader } from "./modules/catalog/catalog.repository.js";
import { createPlanningPublisher } from "./modules/planning/planning.publisher.js";

const config = loadConfig();
const database = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
const app = buildApp({
  catalogReader: database ? createCatalogReader(database) : undefined,
  planningPublisher: database ? createPlanningPublisher(database) : undefined,
  openClawServiceKey: config.openClawServiceKey,
});

await app.listen({ host: config.host, port: config.port });
