import Fastify from "fastify";

import type { CatalogReader } from "./modules/catalog/catalog.repository.js";
import { registerCatalogRoutes } from "./modules/catalog/catalog.routes.js";
import { registerExecutionRoutes } from "./modules/execution/execution.routes.js";
import type { SessionExecutionWriter } from "./modules/execution/execution.types.js";
import { registerPlanningRoutes } from "./modules/planning/planning.routes.js";
import type { PlanningPublisher, PlanningWeekReader } from "./modules/planning/planning.types.js";

export function buildApp(
  dependencies: {
    catalogReader?: CatalogReader;
    planningPublisher?: PlanningPublisher;
    planningWeekReader?: PlanningWeekReader;
    sessionExecutionWriter?: SessionExecutionWriter;
    openClawServiceKey?: string;
  } = {},
) {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  registerCatalogRoutes(app, dependencies.catalogReader);
  registerPlanningRoutes(app, dependencies);
  registerExecutionRoutes(app, dependencies.sessionExecutionWriter);
  return app;
}
