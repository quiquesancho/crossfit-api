import Fastify from "fastify";

import type { CatalogReader } from "./modules/catalog/catalog.repository.js";
import { registerCatalogRoutes } from "./modules/catalog/catalog.routes.js";
import { registerExecutionRoutes } from "./modules/execution/execution.routes.js";
import type { SessionExecutionWriter } from "./modules/execution/execution.types.js";
import { registerHistoryRoutes } from "./modules/history/history.routes.js";
import type { ExecutionHistoryReader } from "./modules/history/history.types.js";
import { registerPlanningRoutes } from "./modules/planning/planning.routes.js";
import type { PlanningPublisher, PlanningWeekReader } from "./modules/planning/planning.types.js";

export function buildApp(
  dependencies: {
    catalogReader?: CatalogReader;
    planningPublisher?: PlanningPublisher;
    planningWeekReader?: PlanningWeekReader;
    sessionExecutionWriter?: SessionExecutionWriter;
    executionHistoryReader?: ExecutionHistoryReader;
    openClawServiceKey?: string;
  } = {},
) {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  registerCatalogRoutes(app, dependencies.catalogReader);
  registerPlanningRoutes(app, dependencies);
  registerExecutionRoutes(app, dependencies.sessionExecutionWriter);
  registerHistoryRoutes(app, dependencies.executionHistoryReader);
  return app;
}
