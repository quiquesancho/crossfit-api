import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../db/client.js";
import {
  planVersion,
  plannedBlock,
  plannedSession,
  plannedWeek,
  prescription,
  trainingPlan,
} from "../../db/schema.js";
import { hashPlanningPublication } from "./planning.hash.js";
import { createPlanningPublisher } from "./planning.publisher.js";
import {
  LocalAthleteNotFoundError,
  PlanningValidationError,
  PlanningVersionConflictError,
  type PlanningPublication,
} from "./planning.types.js";

const publication: PlanningPublication = {
  sourceVersion: "source-v1",
  title: "Plan de prueba",
  weeks: [
    {
      weekStart: "2026-10-19",
      sessions: [
        {
          externalId: "session-1",
          plannedDate: "2026-10-20",
          title: "Sesión de prueba",
          blocks: [
            {
              blockTypeId: "019b4e0a-0000-7000-8000-000000000003",
              title: "Fuerza",
              prescriptions: [
                {
                  movementId: "019b4e0a-0000-7000-8000-000000000010",
                  details: { sets: 4, repetitions: 4 },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

type InsertCapture = { table: unknown; values: unknown };

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

function fakeDatabase(selectResults: unknown[][], returningResults: unknown[][] = []) {
  const inserts: InsertCapture[] = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => resultQuery(selectResults.shift() ?? [])),
    insert: vi.fn((table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        const resolved = Promise.resolve(undefined);
        return {
          returning: vi.fn().mockResolvedValue(returningResults.shift() ?? []),
          then: resolved.then.bind(resolved),
        };
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          updates.push({ table, values });
        },
      }),
    })),
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as Database;
  return { database, inserts, updates, tx };
}

describe("planning publisher", () => {
  it("persists a complete published version atomically", async () => {
    const athleteId = "019b4e0a-0000-7000-8000-000000000001";
    const planId = "019b4e0a-0000-7000-8000-000000000030";
    const versionId = "019b4e0a-0000-7000-8000-000000000031";
    const { database, inserts } = fakeDatabase(
      [
        [{ id: athleteId }],
        [],
        [{ id: publication.weeks[0]!.sessions[0]!.blocks[0]!.blockTypeId }],
        [{ id: publication.weeks[0]!.sessions[0]!.blocks[0]!.prescriptions![0]!.movementId }],
        [{ number: null }],
      ],
      [[{ id: planId }], [{ id: versionId }], [{ id: "week-id" }], [{ id: "session-id" }], [{ id: "block-id" }]],
    );

    const result = await createPlanningPublisher(database).publish("plan-1", publication);

    expect(result).toEqual({ trainingPlanId: planId, planVersionId: versionId, status: "published" });
    expect(inserts.map(({ table }) => table)).toEqual([
      trainingPlan,
      planVersion,
      plannedWeek,
      plannedSession,
      plannedBlock,
      prescription,
    ]);
    expect(inserts.find(({ table }) => table === planVersion)?.values).toEqual(
      expect.objectContaining({ versionNumber: 1, sourceVersion: "source-v1", status: "published" }),
    );
  });

  it("returns an unchanged version before revalidating archived references", async () => {
    const { database, tx } = fakeDatabase([
      [{ id: "athlete-id" }],
      [{ id: "plan-id" }],
      [{ id: "version-id", sourceHash: hashPlanningPublication(publication) }],
    ]);

    await expect(createPlanningPublisher(database).publish("plan-1", publication)).resolves.toEqual({
      trainingPlanId: "plan-id",
      planVersionId: "version-id",
      status: "unchanged",
    });
    expect(tx.select).toHaveBeenCalledTimes(3);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects a reused source version with different content", async () => {
    const { database } = fakeDatabase([
      [{ id: "athlete-id" }],
      [{ id: "plan-id" }],
      [{ id: "version-id", sourceHash: "different" }],
    ]);

    await expect(createPlanningPublisher(database).publish("plan-1", publication)).rejects.toBeInstanceOf(
      PlanningVersionConflictError,
    );
  });

  it("rejects inactive planning references", async () => {
    const { database } = fakeDatabase([
      [{ id: "athlete-id" }],
      [],
      [],
      [{ id: publication.weeks[0]!.sessions[0]!.blocks[0]!.prescriptions![0]!.movementId }],
    ]);

    await expect(createPlanningPublisher(database).publish("plan-1", publication)).rejects.toMatchObject({
      constructor: PlanningValidationError,
      issues: [expect.objectContaining({ path: "weeks[0].sessions[0].blocks[0].blockTypeId" })],
    });
  });

  it("requires the local athlete profile", async () => {
    const { database } = fakeDatabase([[]]);
    await expect(createPlanningPublisher(database).publish("plan-1", publication)).rejects.toBeInstanceOf(
      LocalAthleteNotFoundError,
    );
  });
});
