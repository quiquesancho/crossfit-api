import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createDatabase } from "./db/client.js";
import { createCatalogReader } from "./modules/catalog/catalog.repository.js";
import { createMovementCatalogWriter } from "./modules/catalog/movement-catalog.writer.js";
import { createSessionExecutionWriter } from "./modules/execution/execution.writer.js";
import { createExecutionHistoryReader } from "./modules/history/history.repository.js";
import { createPersonalRecordReader } from "./modules/personal-records/personal-records.repository.js";
import { createPersonalRecordWriter } from "./modules/personal-records/personal-records.writer.js";
import { createPlanningPublisher } from "./modules/planning/planning.publisher.js";
import { createPlanningWeekReader } from "./modules/planning/planning.repository.js";
import { createProgressReader } from "./modules/progress/progress.repository.js";

const config = loadConfig();
const database = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
const app = buildApp({
  catalogReader: database ? createCatalogReader(database) : undefined,
  movementCatalogWriter: database ? createMovementCatalogWriter(database) : undefined,
  planningPublisher: database ? createPlanningPublisher(database) : undefined,
  planningWeekReader: database ? createPlanningWeekReader(database) : undefined,
  sessionExecutionWriter: database ? createSessionExecutionWriter(database) : undefined,
  executionHistoryReader: database ? createExecutionHistoryReader(database) : undefined,
  personalRecordReader: database ? createPersonalRecordReader(database) : undefined,
  personalRecordWriter: database ? createPersonalRecordWriter(database) : undefined,
  progressReader: database ? createProgressReader(database) : undefined,
  openClawServiceKey: config.openClawServiceKey,
});

await app.listen({ host: config.host, port: config.port });
