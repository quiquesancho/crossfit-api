import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../db/client.js";
import { blockExecution, sessionExecution } from "../../db/schema.js";
import { hashSessionExecution } from "./execution.hash.js";
import {
  ExecutionLocalAthleteNotFoundError,
  ExecutionRevisionConflictError,
  ExecutionValidationError,
  type SessionExecutionSnapshot,
} from "./execution.types.js";
import { createSessionExecutionWriter } from "./execution.writer.js";

const executionId = "019b4e0a-0000-7000-8000-000000000101";
const snapshot: SessionExecutionSnapshot = {
  baseRevision: 0,
  plannedSessionId: "019b4e0a-0000-7000-8000-000000000041",
  executionDate: "2026-10-20",
  status: "draft",
  blocks: [
    {
      id: "019b4e0a-0000-7000-8000-000000000102",
      plannedBlockId: "019b4e0a-0000-7000-8000-000000000042",
      position: 1,
      blockTypeId: "019b4e0a-0000-7000-8000-000000000003",
      title: "Fuerza",
      status: "completed_without_metric",
    },
  ],
};

function resultQuery(result: unknown[]) {
  const resolved = Promise.resolve(result);
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    limit: () => resolved,
    then: resolved.then.bind(resolved),
  };
  return query;
}

function fakeDatabase(selectResults: unknown[][]) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const deletes: unknown[] = [];
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => resultQuery(selectResults.shift() ?? [])),
    insert: vi.fn((table: unknown) => ({
      values: async (values: unknown) => {
        inserts.push({ table, values });
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          updates.push({ table, values });
        },
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: async () => {
        deletes.push(table);
      },
    })),
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as Database;
  return { database, inserts, updates, deletes, tx };
}

describe("session execution writer", () => {
  it("creates a complete execution atomically", async () => {
    const { database, inserts, deletes } = fakeDatabase([
      [{ id: "athlete-id" }],
      [],
      [{ id: snapshot.plannedSessionId }],
      [{ id: snapshot.blocks[0]!.blockTypeId }],
      [{ id: snapshot.blocks[0]!.plannedBlockId }],
    ]);

    const result = await createSessionExecutionWriter(database).synchronize(executionId, snapshot);

    expect(result).toEqual(expect.objectContaining({ id: executionId, revision: 1, result: "persisted" }));
    expect(inserts.map(({ table }) => table)).toEqual([sessionExecution, blockExecution]);
    expect(inserts[0]?.values).toEqual(expect.objectContaining({ id: executionId, athleteId: "athlete-id" }));
    expect(deletes).toEqual([]);
  });

  it("replaces blocks and increments the matching revision", async () => {
    const updatedSnapshot = { ...snapshot, baseRevision: 1, generalNote: "Actualizado" };
    const { database, inserts, updates, deletes } = fakeDatabase([
      [
        { id: "athlete-id" },
      ],
      [
        {
          athleteId: "athlete-id",
          revision: 1,
          contentHash: "previous-hash",
          status: "draft",
          updatedAt: new Date("2026-10-20T13:00:00Z"),
        },
      ],
      [{ id: snapshot.plannedSessionId }],
      [{ id: snapshot.blocks[0]!.blockTypeId }],
      [{ id: snapshot.blocks[0]!.plannedBlockId }],
    ]);

    const result = await createSessionExecutionWriter(database).synchronize(executionId, updatedSnapshot);

    expect(result).toEqual(expect.objectContaining({ revision: 2, result: "persisted" }));
    expect(updates).toEqual([expect.objectContaining({ table: sessionExecution })]);
    expect(deletes).toEqual([blockExecution]);
    expect(inserts.map(({ table }) => table)).toEqual([blockExecution]);
  });

  it("returns an identical retry without checking its stale base revision", async () => {
    const updatedAt = new Date("2026-10-20T13:00:00Z");
    const { database, tx } = fakeDatabase([
      [{ id: "athlete-id" }],
      [
        {
          athleteId: "athlete-id",
          revision: 3,
          contentHash: hashSessionExecution(snapshot),
          status: "draft",
          updatedAt,
        },
      ],
    ]);

    await expect(createSessionExecutionWriter(database).synchronize(executionId, snapshot)).resolves.toEqual({
      id: executionId,
      revision: 3,
      status: "draft",
      updatedAt: updatedAt.toISOString(),
      result: "unchanged",
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects a different snapshot based on a stale revision", async () => {
    const { database } = fakeDatabase([
      [{ id: "athlete-id" }],
      [
        {
          athleteId: "athlete-id",
          revision: 2,
          contentHash: "different-hash",
          status: "draft",
          updatedAt: new Date(),
        },
      ],
    ]);

    await expect(createSessionExecutionWriter(database).synchronize(executionId, snapshot)).rejects.toBeInstanceOf(
      ExecutionRevisionConflictError,
    );
  });

  it("reports invalid planning and catalog references", async () => {
    const { database } = fakeDatabase([[{ id: "athlete-id" }], [], [], [], []]);

    await expect(createSessionExecutionWriter(database).synchronize(executionId, snapshot)).rejects.toMatchObject({
      constructor: ExecutionValidationError,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "plannedSessionId" }),
        expect.objectContaining({ path: "blocks[0].blockTypeId" }),
        expect.objectContaining({ path: "blocks[0].plannedBlockId" }),
      ]),
    });
  });

  it("requires the local athlete profile", async () => {
    const { database } = fakeDatabase([[]]);
    await expect(createSessionExecutionWriter(database).synchronize(executionId, snapshot)).rejects.toBeInstanceOf(
      ExecutionLocalAthleteNotFoundError,
    );
  });
});
