import Fastify from "fastify";

import type { CatalogReader } from "./modules/catalog/catalog.repository.js";
import { registerCatalogRoutes } from "./modules/catalog/catalog.routes.js";
import { registerMovementCatalogRoutes } from "./modules/catalog/movement-catalog.routes.js";
import type { MovementCatalogWriter } from "./modules/catalog/movement-catalog.types.js";
import { registerExecutionRoutes } from "./modules/execution/execution.routes.js";
import type { SessionExecutionWriter } from "./modules/execution/execution.types.js";
import { registerHistoryRoutes } from "./modules/history/history.routes.js";
import type { ExecutionHistoryReader } from "./modules/history/history.types.js";
import { registerPersonalRecordRoutes } from "./modules/personal-records/personal-records.routes.js";
import type {
  PersonalRecordReader,
  PersonalRecordWriter,
} from "./modules/personal-records/personal-records.types.js";
import { registerPlanningRoutes } from "./modules/planning/planning.routes.js";
import type { PlanningPublisher, PlanningWeekReader } from "./modules/planning/planning.types.js";
import { registerProgressRoutes } from "./modules/progress/progress.routes.js";
import type { ProgressReader } from "./modules/progress/progress.types.js";

export function buildApp(
  dependencies: {
    catalogReader?: CatalogReader;
    movementCatalogWriter?: MovementCatalogWriter;
    planningPublisher?: PlanningPublisher;
    planningWeekReader?: PlanningWeekReader;
    sessionExecutionWriter?: SessionExecutionWriter;
    executionHistoryReader?: ExecutionHistoryReader;
    personalRecordReader?: PersonalRecordReader;
    personalRecordWriter?: PersonalRecordWriter;
    progressReader?: ProgressReader;
    openClawServiceKey?: string;
  } = {},
) {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  registerCatalogRoutes(app, dependencies.catalogReader);
  registerMovementCatalogRoutes(app, dependencies);
  registerPlanningRoutes(app, dependencies);
  registerExecutionRoutes(app, dependencies.sessionExecutionWriter);
  registerHistoryRoutes(app, dependencies.executionHistoryReader);
  registerPersonalRecordRoutes(
    app,
    dependencies.personalRecordReader,
    dependencies.personalRecordWriter,
  );
  registerProgressRoutes(app, dependencies.progressReader);
  return app;
}
