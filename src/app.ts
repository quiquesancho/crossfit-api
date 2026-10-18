import Fastify from "fastify";

import type { CatalogReader } from "./modules/catalog/catalog.repository.js";
import { registerCatalogRoutes } from "./modules/catalog/catalog.routes.js";

export function buildApp(dependencies: { catalogReader?: CatalogReader } = {}) {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  registerCatalogRoutes(app, dependencies.catalogReader);
  return app;
}
