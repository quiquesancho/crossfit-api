import type { FastifyInstance } from "fastify";

import { validServiceKey } from "../../shared/service-key.js";
import {
  LocalAthleteNotFoundError,
  PlanningValidationError,
  PlanningVersionConflictError,
  type PlanningPublisher,
  type PlanningWeekReader,
} from "./planning.types.js";
import { isIsoWeekStart, validatePlanningPublication } from "./planning.validation.js";

export function registerPlanningRoutes(
  app: FastifyInstance,
  dependencies: {
    planningPublisher?: PlanningPublisher;
    planningWeekReader?: PlanningWeekReader;
    openClawServiceKey?: string;
  },
) {
  app.get<{ Params: { weekStart: string } }>("/api/v1/planning/weeks/:weekStart", async (request, reply) => {
    if (!isIsoWeekStart(request.params.weekStart)) {
      return reply.code(400).send({
        code: "validation_error",
        message: "Contract validation failed.",
        issues: [{ path: "weekStart", message: "Must be a valid ISO date for a Monday." }],
      });
    }
    if (!dependencies.planningWeekReader) {
      return reply.code(503).send({ code: "service_unavailable", message: "Planning queries are unavailable." });
    }

    const week = await dependencies.planningWeekReader.getWeek(request.params.weekStart);
    if (!week) {
      return reply.code(404).send({ code: "planning_week_not_found", message: "No published planning week found." });
    }
    return week;
  });

  app.put<{ Params: { externalPlanId: string }; Body: unknown }>(
    "/api/v1/integrations/openclaw/training-plans/:externalPlanId",
    async (request, reply) => {
      const { planningPublisher, openClawServiceKey } = dependencies;
      if (!planningPublisher || !openClawServiceKey) {
        return reply.code(503).send({ code: "service_unavailable", message: "Planning publication is unavailable." });
      }
      if (!validServiceKey(request.headers["x-openclaw-service-key"], openClawServiceKey)) {
        return reply.code(401).send({ code: "unauthorized", message: "Invalid service credential." });
      }

      const externalPlanId = request.params.externalPlanId.trim();
      if (!externalPlanId) {
        return reply.code(400).send({
          code: "validation_error",
          message: "Contract validation failed.",
          issues: [{ path: "externalPlanId", message: "Must be a non-empty string." }],
        });
      }

      const validation = validatePlanningPublication(request.body);
      if (!validation.valid) {
        return reply.code(400).send({
          code: "validation_error",
          message: "Contract validation failed.",
          issues: validation.issues,
        });
      }

      try {
        const result = await planningPublisher.publish(externalPlanId, validation.publication);
        return reply.code(result.status === "published" ? 201 : 200).send(result);
      } catch (error) {
        if (error instanceof PlanningValidationError) {
          return reply.code(400).send({
            code: "validation_error",
            message: error.message,
            issues: error.issues,
          });
        }
        if (error instanceof PlanningVersionConflictError) {
          return reply.code(409).send({ code: "source_version_conflict", message: error.message });
        }
        if (error instanceof LocalAthleteNotFoundError) {
          return reply.code(503).send({ code: "local_athlete_unavailable", message: error.message });
        }
        throw error;
      }
    },
  );
}
