import Fastify from "fastify";

import type { CatalogReader } from "./catalogs.js";

export function buildApp(dependencies: { catalogReader?: CatalogReader } = {}) {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  app.get<{ Params: { catalogKey: string } }>("/api/v1/catalogs/:catalogKey", async (request, reply) => {
    if (!dependencies.catalogReader) return reply.code(503).send({ code: "database_unavailable" });
    return { entries: await dependencies.catalogReader.listEntries(request.params.catalogKey) };
  });
  app.get("/api/v1/catalog/movements", async (_request, reply) => {
    if (!dependencies.catalogReader) return reply.code(503).send({ code: "database_unavailable" });
    return { movements: await dependencies.catalogReader.listMovements() };
  });
  return app;
}
