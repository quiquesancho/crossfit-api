import type { FastifyInstance } from "fastify";

import { isIsoDate } from "../planning/planning.validation.js";
import { decodeHistoryCursor } from "./history.cursor.js";
import type { ExecutionHistoryReader } from "./history.types.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_RANGE_DAYS = 366;

type Query = Record<string, string | undefined>;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function validationError(path: string, message: string) {
  return {
    code: "validation_error",
    message: "Contract validation failed.",
    issues: [{ path, message }],
  };
}

function validDateRange(from: unknown, to: unknown): { from: string; to: string } | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  if (from > to) return null;
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) return null;
  return { from, to };
}

function parseLimit(value: string | undefined): number | null {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

export function registerHistoryRoutes(app: FastifyInstance, reader?: ExecutionHistoryReader) {
  app.get<{ Querystring: Query }>("/api/v1/calendar", async (request, reply) => {
    const from = request.query.from;
    const to = request.query.to;
    if (!isIsoDate(from)) return reply.code(400).send(validationError("from", "Must be a valid ISO date."));
    if (!isIsoDate(to)) return reply.code(400).send(validationError("to", "Must be a valid ISO date."));
    if (from > to) return reply.code(400).send(validationError("from", "Must not be later than to."));
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
      return reply.code(400).send(validationError("to", `The range cannot exceed ${MAX_RANGE_DAYS} days.`));
    }
    if (!reader) {
      return reply.code(503).send({ code: "service_unavailable", message: "History queries are unavailable." });
    }
    return reader.getCalendar(from, to);
  });

  app.get<{ Querystring: Query }>("/api/v1/session-executions", async (request, reply) => {
    const from = request.query.from;
    const to = request.query.to;
    if (from !== undefined && !isIsoDate(from)) {
      return reply.code(400).send(validationError("from", "Must be a valid ISO date."));
    }
    if (to !== undefined && !isIsoDate(to)) {
      return reply.code(400).send(validationError("to", "Must be a valid ISO date."));
    }
    if (from && to) {
      const range = validDateRange(from, to);
      if (!range) {
        return reply
          .code(400)
          .send(validationError("to", `Must be on or after from and within ${MAX_RANGE_DAYS} days.`));
      }
    }

    const limit = parseLimit(request.query.limit);
    if (limit === null) {
      return reply
        .code(400)
        .send(validationError("limit", `Must be an integer between 1 and ${MAX_LIMIT}.`));
    }

    let cursor;
    if (request.query.cursor !== undefined) {
      const decoded = decodeHistoryCursor(request.query.cursor);
      if (!decoded) return reply.code(400).send(validationError("cursor", "Must be a valid cursor."));
      cursor = decoded;
    }

    if (!reader) {
      return reply.code(503).send({ code: "service_unavailable", message: "History queries are unavailable." });
    }
    return reader.listExecutions({ from, to, cursor, limit });
  });
}
