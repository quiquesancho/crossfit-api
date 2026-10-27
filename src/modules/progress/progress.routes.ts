import type { FastifyInstance } from "fastify";

import { isIsoDate } from "../planning/planning.validation.js";
import {
  ProgressLocalAthleteNotFoundError,
  type ProgressReader,
  type VolumeGroupBy,
} from "./progress.types.js";

const MAX_RANGE_DAYS = 366;
const GROUP_BYS: VolumeGroupBy[] = ["movement", "family"];

type Query = Record<string, string | undefined>;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

function validationError(path: string, message: string) {
  return {
    code: "validation_error",
    message: "Contract validation failed.",
    issues: [{ path, message }],
  };
}

export function registerProgressRoutes(app: FastifyInstance, reader?: ProgressReader) {
  app.get<{ Querystring: Query }>("/api/v1/progress/volume", async (request, reply) => {
    const from = request.query.from;
    const to = request.query.to;
    if (!isIsoDate(from)) {
      return reply.code(400).send(validationError("from", "Must be a valid ISO date."));
    }
    if (!isIsoDate(to)) {
      return reply.code(400).send(validationError("to", "Must be a valid ISO date."));
    }
    if (from > to) {
      return reply.code(400).send(validationError("from", "Must not be later than to."));
    }
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
      return reply
        .code(400)
        .send(validationError("to", `The range cannot exceed ${MAX_RANGE_DAYS} days.`));
    }

    const groupBy = (request.query.groupBy ?? "movement") as VolumeGroupBy;
    if (!GROUP_BYS.includes(groupBy)) {
      return reply
        .code(400)
        .send(validationError("groupBy", "Must be movement or family."));
    }

    if (!reader) {
      return reply
        .code(503)
        .send({ code: "service_unavailable", message: "Progress queries are unavailable." });
    }

    try {
      return await reader.getVolume({ from, to, groupBy });
    } catch (error) {
      if (error instanceof ProgressLocalAthleteNotFoundError) {
        return reply.code(503).send({
          code: "local_athlete_unavailable",
          message: "The local athlete profile is unavailable.",
        });
      }
      throw error;
    }
  });
}
