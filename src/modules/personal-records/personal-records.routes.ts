import type { FastifyInstance, FastifyReply } from "fastify";

import { isIsoDate } from "../planning/planning.validation.js";
import { decodePersonalRecordCursor } from "./personal-records.cursor.js";
import {
  PersonalRecordConflictError,
  PersonalRecordLocalAthleteNotFoundError,
  PersonalRecordNotFoundError,
  PersonalRecordValidationError,
  type ManualPersonalRecordInput,
  type PersonalRecordReader,
  type PersonalRecordStatus,
  type PersonalRecordWriter,
} from "./personal-records.types.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: PersonalRecordStatus[] = ["suggested", "confirmed", "discarded"];

type Query = Record<string, string | undefined>;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validationError(path: string, message: string) {
  return {
    code: "validation_error",
    message: "Contract validation failed.",
    issues: [{ path, message }],
  };
}

function parseLimit(value: string | undefined): number | null {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

function parseStatus(value: string | undefined): PersonalRecordStatus | null | undefined {
  if (value === undefined) return undefined;
  return STATUSES.includes(value as PersonalRecordStatus)
    ? (value as PersonalRecordStatus)
    : null;
}

function validateManualBody(
  body: unknown,
): { valid: true; input: ManualPersonalRecordInput } | { valid: false; issues: { path: string; message: string }[] } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { valid: false, issues: [{ path: "body", message: "Must be an object." }] };
  }
  const value = body as Record<string, unknown>;
  const issues: { path: string; message: string }[] = [];

  const hasMovement = value.movementId !== undefined && value.movementId !== null;
  const hasComplex = value.complexVersionId !== undefined && value.complexVersionId !== null;
  if (hasMovement === hasComplex) {
    issues.push({
      path: "movementId",
      message: "Provide exactly one of movementId or complexVersionId.",
    });
  }
  if (hasMovement && !isUuid(value.movementId)) {
    issues.push({ path: "movementId", message: "Must be a UUID." });
  }
  if (hasComplex && !isUuid(value.complexVersionId)) {
    issues.push({ path: "complexVersionId", message: "Must be a UUID." });
  }
  if (
    typeof value.repetitions !== "number" ||
    !Number.isInteger(value.repetitions) ||
    value.repetitions <= 0
  ) {
    issues.push({ path: "repetitions", message: "Must be a positive integer." });
  }
  if (typeof value.loadKg !== "number" || !Number.isFinite(value.loadKg) || value.loadKg < 0) {
    issues.push({ path: "loadKg", message: "Must be a non-negative number." });
  }
  if (!isIsoDate(value.achievedOn)) {
    issues.push({ path: "achievedOn", message: "Must be an ISO date." });
  }
  if (value.note !== undefined && value.note !== null && typeof value.note !== "string") {
    issues.push({ path: "note", message: "Must be a string." });
  }

  if (issues.length > 0) return { valid: false, issues };
  return {
    valid: true,
    input: {
      movementId: hasMovement ? (value.movementId as string) : undefined,
      complexVersionId: hasComplex ? (value.complexVersionId as string) : undefined,
      repetitions: value.repetitions as number,
      loadKg: value.loadKg as number,
      achievedOn: value.achievedOn as string,
      note: typeof value.note === "string" ? value.note : undefined,
    },
  };
}

function validateDecisionBody(
  body: unknown,
): { valid: true; decision: "confirmed" | "discarded" } | { valid: false; issues: { path: string; message: string }[] } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { valid: false, issues: [{ path: "body", message: "Must be an object." }] };
  }
  const { status } = body as Record<string, unknown>;
  if (status !== "confirmed" && status !== "discarded") {
    return {
      valid: false,
      issues: [{ path: "status", message: "Must be confirmed or discarded." }],
    };
  }
  return { valid: true, decision: status };
}

function sendWriterError(reply: FastifyReply, error: unknown) {
  if (error instanceof PersonalRecordValidationError) {
    return reply.code(400).send({
      code: "validation_error",
      message: "Contract validation failed.",
      issues: error.issues,
    });
  }
  if (error instanceof PersonalRecordNotFoundError) {
    return reply.code(404).send({ code: "not_found", message: "Personal record not found." });
  }
  if (error instanceof PersonalRecordConflictError) {
    return reply.code(409).send({ code: error.code, message: error.message });
  }
  if (error instanceof PersonalRecordLocalAthleteNotFoundError) {
    return reply.code(503).send({
      code: "local_athlete_unavailable",
      message: "The local athlete profile is unavailable.",
    });
  }
  throw error;
}

export function registerPersonalRecordRoutes(
  app: FastifyInstance,
  reader?: PersonalRecordReader,
  writer?: PersonalRecordWriter,
) {
  app.get<{ Querystring: Query }>("/api/v1/personal-records", async (request, reply) => {
    if (!reader) {
      return reply
        .code(503)
        .send({ code: "service_unavailable", message: "Personal records are unavailable." });
    }

    const { movementId, complexVersionId, status, cursor, limit } = request.query;
    if (movementId !== undefined && !isUuid(movementId)) {
      return reply.code(400).send(validationError("movementId", "Must be a UUID."));
    }
    if (complexVersionId !== undefined && !isUuid(complexVersionId)) {
      return reply.code(400).send(validationError("complexVersionId", "Must be a UUID."));
    }
    if (movementId !== undefined && complexVersionId !== undefined) {
      return reply.code(400).send(
        validationError("movementId", "Provide at most one anchor filter."),
      );
    }
    const parsedStatus = parseStatus(status);
    if (parsedStatus === null) {
      return reply
        .code(400)
        .send(validationError("status", "Must be suggested, confirmed or discarded."));
    }
    const parsedLimit = parseLimit(limit);
    if (parsedLimit === null) {
      return reply.code(400).send(validationError("limit", `Must be between 1 and ${MAX_LIMIT}.`));
    }
    const decodedCursor = cursor === undefined ? undefined : decodePersonalRecordCursor(cursor);
    if (cursor !== undefined && !decodedCursor) {
      return reply.code(400).send(validationError("cursor", "Must be a valid cursor."));
    }

    return reader.list({
      movementId,
      complexVersionId,
      status: parsedStatus,
      cursor: decodedCursor ?? undefined,
      limit: parsedLimit,
    });
  });

  app.get("/api/v1/personal-records/current", async (_request, reply) => {
    if (!reader) {
      return reply
        .code(503)
        .send({ code: "service_unavailable", message: "Personal records are unavailable." });
    }
    return { records: await reader.listCurrent() };
  });

  app.get("/api/v1/personal-records/suggestions", async (_request, reply) => {
    if (!reader) {
      return reply
        .code(503)
        .send({ code: "service_unavailable", message: "Personal records are unavailable." });
    }
    return { items: await reader.listSuggestions() };
  });

  app.put<{ Params: { recordId: string }; Body: unknown }>(
    "/api/v1/personal-records/:recordId",
    async (request, reply) => {
      if (!isUuid(request.params.recordId)) {
        return reply.code(400).send(validationError("recordId", "Must be a UUID."));
      }
      const validation = validateManualBody(request.body);
      if (!validation.valid) {
        return reply.code(400).send({
          code: "validation_error",
          message: "Contract validation failed.",
          issues: validation.issues,
        });
      }
      if (!writer) {
        return reply
          .code(503)
          .send({ code: "service_unavailable", message: "Personal records are unavailable." });
      }
      try {
        return await writer.createManual(request.params.recordId, validation.input);
      } catch (error) {
        return sendWriterError(reply, error);
      }
    },
  );

  app.patch<{ Params: { recordId: string }; Body: unknown }>(
    "/api/v1/personal-records/:recordId",
    async (request, reply) => {
      if (!isUuid(request.params.recordId)) {
        return reply.code(400).send(validationError("recordId", "Must be a UUID."));
      }
      const validation = validateDecisionBody(request.body);
      if (!validation.valid) {
        return reply.code(400).send({
          code: "validation_error",
          message: "Contract validation failed.",
          issues: validation.issues,
        });
      }
      if (!writer) {
        return reply
          .code(503)
          .send({ code: "service_unavailable", message: "Personal records are unavailable." });
      }
      try {
        return await writer.decide(request.params.recordId, validation.decision);
      } catch (error) {
        return sendWriterError(reply, error);
      }
    },
  );
}
