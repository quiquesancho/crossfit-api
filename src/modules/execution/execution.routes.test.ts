import { afterAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import { hashSessionExecution } from "./execution.hash.js";
import {
  ExecutionLocalAthleteNotFoundError,
  ExecutionRevisionConflictError,
  ExecutionValidationError,
  type SessionExecutionSnapshot,
} from "./execution.types.js";
import { validateSessionExecutionSnapshot } from "./execution.validation.js";

const executionId = "019b4e0a-0000-7000-8000-000000000101";
const snapshot: SessionExecutionSnapshot = {
  baseRevision: 0,
  plannedSessionId: "019b4e0a-0000-7000-8000-000000000041",
  executionDate: "2026-10-20",
  status: "draft",
  generalNote: "Primera sesión",
  blocks: [
    {
      id: "019b4e0a-0000-7000-8000-000000000102",
      plannedBlockId: "019b4e0a-0000-7000-8000-000000000042",
      position: 1,
      blockTypeId: "019b4e0a-0000-7000-8000-000000000003",
      title: "Fuerza",
      status: "completed_without_metric",
      notes: "Realizado sin anotar la carga.",
    },
  ],
};

describe("execution snapshot validation", () => {
  it("accepts a complete snapshot and ignores the base revision in its hash", () => {
    expect(validateSessionExecutionSnapshot(snapshot)).toEqual({ valid: true, snapshot });
    expect(hashSessionExecution({ ...snapshot, baseRevision: 2 })).toBe(hashSessionExecution(snapshot));
  });

  it("requires UUIDv7 child ids and unique positions", () => {
    const invalid = structuredClone(snapshot);
    invalid.blocks.push({ ...invalid.blocks[0]!, id: "019b4e0a-0000-4000-8000-000000000102" });

    const result = validateSessionExecutionSnapshot(invalid);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "blocks[1].id" }),
          expect.objectContaining({ path: "blocks[1].position" }),
        ]),
      );
    }
  });

  it("does not allow planned blocks in a free execution", () => {
    const invalid = structuredClone(snapshot);
    delete invalid.plannedSessionId;
    expect(validateSessionExecutionSnapshot(invalid)).toEqual({
      valid: false,
      issues: [{ path: "blocks[0].plannedBlockId", message: "Requires plannedSessionId." }],
    });
  });
});

describe("session execution synchronization route", () => {
  const synchronize = vi.fn();
  const app = buildApp({ sessionExecutionWriter: { synchronize } });
  afterAll(async () => app.close());

  it("persists a valid complete snapshot", async () => {
    synchronize.mockResolvedValueOnce({
      id: executionId,
      revision: 1,
      status: "draft",
      updatedAt: "2026-10-20T13:00:00.000Z",
      result: "persisted",
    });
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/session-executions/${executionId}`,
      payload: snapshot,
    });

    expect(response.statusCode).toBe(200);
    expect(synchronize).toHaveBeenCalledWith(executionId, snapshot);
    expect(response.json()).toEqual(expect.objectContaining({ revision: 1, result: "persisted" }));
  });

  it("validates the client-generated execution id", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/session-executions/019b4e0a-0000-4000-8000-000000000101",
      payload: snapshot,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(expect.objectContaining({ code: "validation_error" }));
  });

  it.each([
    [new ExecutionRevisionConflictError(), 409, "execution_revision_conflict"],
    [new ExecutionLocalAthleteNotFoundError(), 503, "local_athlete_unavailable"],
    [new ExecutionValidationError([{ path: "blocks[0].blockTypeId", message: "Unknown." }]), 400, "validation_error"],
  ])("maps synchronization errors", async (error, status, code) => {
    synchronize.mockRejectedValueOnce(error);
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/session-executions/${executionId}`,
      payload: snapshot,
    });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual(expect.objectContaining({ code }));
  });
});

describe("session execution route without persistence", () => {
  const app = buildApp();
  afterAll(async () => app.close());

  it("returns 503 for a valid snapshot", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/session-executions/${executionId}`,
      payload: snapshot,
    });
    expect(response.statusCode).toBe(503);
  });
});
