import type { FastifyInstance } from "fastify";

import { validServiceKey } from "../../shared/service-key.js";
import {
  MovementCatalogConflictError,
  MovementCatalogValidationError,
  type MovementCatalogWriter,
} from "./movement-catalog.types.js";
import { validateMovementCatalogImport } from "./movement-catalog.validation.js";

export function registerMovementCatalogRoutes(
  app: FastifyInstance,
  dependencies: {
    movementCatalogWriter?: MovementCatalogWriter;
    openClawServiceKey?: string;
  },
) {
  app.put<{ Body: unknown }>(
    "/api/v1/integrations/openclaw/movement-catalog",
    async (request, reply) => {
      const { movementCatalogWriter, openClawServiceKey } = dependencies;
      if (!movementCatalogWriter || !openClawServiceKey) {
        return reply.code(503).send({
          code: "service_unavailable",
          message: "Movement catalog import is unavailable.",
        });
      }
      if (!validServiceKey(request.headers["x-openclaw-service-key"], openClawServiceKey)) {
        return reply.code(401).send({ code: "unauthorized", message: "Invalid service credential." });
      }

      const validation = validateMovementCatalogImport(request.body);
      if (!validation.valid) {
        return reply.code(400).send({
          code: "validation_error",
          message: "Contract validation failed.",
          issues: validation.issues,
        });
      }

      try {
        return await movementCatalogWriter.importCatalog(validation.input);
      } catch (error) {
        if (error instanceof MovementCatalogValidationError) {
          return reply.code(400).send({
            code: "validation_error",
            message: error.message,
            issues: error.issues,
          });
        }
        if (error instanceof MovementCatalogConflictError) {
          return reply.code(409).send({
            code: error.code,
            message: error.message,
            details: error.details,
          });
        }
        throw error;
      }
    },
  );
}
