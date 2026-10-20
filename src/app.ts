import Fastify from "fastify";

import type { CatalogReader } from "./modules/catalog/catalog.repository.js";
import { registerCatalogRoutes } from "./modules/catalog/catalog.routes.js";
import { registerPlanningRoutes } from "./modules/planning/planning.routes.js";
import type { PlanningPublisher, PlanningWeekReader } from "./modules/planning/planning.types.js";

export function buildApp(
  dependencies: {
    catalogReader?: CatalogReader;
    planningPublisher?: PlanningPublisher;
    planningWeekReader?: PlanningWeekReader;
    openClawServiceKey?: string;
  } = {},
) {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  registerCatalogRoutes(app, dependencies.catalogReader);
  registerPlanningRoutes(app, dependencies);
  return app;
}
