import type { FastifyInstance } from "fastify";

import {
  ExecutionLocalAthleteNotFoundError,
  ExecutionRevisionConflictError,
  ExecutionValidationError,
  type SessionExecutionWriter,
} from "./execution.types.js";
import { isUuidV7, validateSessionExecutionSnapshot } from "./execution.validation.js";

export function registerExecutionRoutes(app: FastifyInstance, writer?: SessionExecutionWriter) {
  app.put<{ Params: { executionId: string }; Body: unknown }>(
    "/api/v1/session-executions/:executionId",
    async (request, reply) => {
      if (!isUuidV7(request.params.executionId)) {
        return reply.code(400).send({
          code: "validation_error",
          message: "Contract validation failed.",
          issues: [{ path: "executionId", message: "Must be a UUIDv7." }],
        });
      }
      const validation = validateSessionExecutionSnapshot(request.body);
      if (!validation.valid) {
        return reply.code(400).send({
          code: "validation_error",
          message: "Contract validation failed.",
          issues: validation.issues,
        });
      }
      if (!writer) {
        return reply.code(503).send({ code: "service_unavailable", message: "Execution synchronization is unavailable." });
      }

      try {
        return await writer.synchronize(request.params.executionId, validation.snapshot);
      } catch (error) {
        if (error instanceof ExecutionValidationError) {
          return reply.code(400).send({
            code: "validation_error",
            message: "Contract validation failed.",
            issues: error.issues,
          });
        }
        if (error instanceof ExecutionRevisionConflictError) {
          return reply.code(409).send({
            code: "execution_revision_conflict",
            message: "The execution was changed from a different revision.",
          });
        }
        if (error instanceof ExecutionLocalAthleteNotFoundError) {
          return reply.code(503).send({
            code: "local_athlete_unavailable",
            message: "The local athlete profile is unavailable.",
          });
        }
        throw error;
      }
    },
  );
}
