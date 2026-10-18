import type { FastifyInstance } from "fastify";

import type { CatalogReader } from "./catalog.repository.js";

export function registerCatalogRoutes(app: FastifyInstance, catalogReader?: CatalogReader) {
  app.get<{ Params: { catalogKey: string } }>("/api/v1/catalogs/:catalogKey", async (request, reply) => {
    if (!catalogReader) return reply.code(503).send({ code: "database_unavailable" });
    return { entries: await catalogReader.listEntries(request.params.catalogKey) };
  });
  app.get("/api/v1/catalog/movements", async (_request, reply) => {
    if (!catalogReader) return reply.code(503).send({ code: "database_unavailable" });
    return { movements: await catalogReader.listMovements() };
  });
}
