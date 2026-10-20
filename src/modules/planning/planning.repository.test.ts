import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../db/client.js";
import { createPlanningWeekReader } from "./planning.repository.js";

function resultQuery(result: unknown[]) {
  const resolved = Promise.resolve(result);
  const query = {
    from: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: () => resolved,
    then: resolved.then.bind(resolved),
  };
  return query;
}

function fakeDatabase(results: unknown[][]) {
  const select = vi.fn(() => resultQuery(results.shift() ?? []));
  return { database: { select } as unknown as Database, select };
}

describe("planning week reader", () => {
  it("composes the latest published week hierarchy", async () => {
    const { database } = fakeDatabase([
      [
        {
          id: "week-id",
          trainingPlanId: "plan-id",
          planVersionId: "version-id",
          planTitle: "Plan de prueba",
          weekStart: "2026-10-19",
          title: "Semana 1",
          priorities: "Fuerza",
        },
      ],
      [
        {
          id: "session-id",
          externalId: "session-1",
          plannedDate: "2026-10-20",
          title: "Sesión 1",
          objective: null,
          durationSeconds: 3600,
          targetRpe: 7,
        },
      ],
      [
        {
          id: "block-id",
          plannedSessionId: "session-id",
          position: 1,
          blockTypeId: "block-type-id",
          blockTypeCode: "strength",
          blockTypeDescription: "Fuerza",
          title: "Fuerza",
          instructions: null,
          durationSeconds: 1200,
          targetRpe: 7,
        },
      ],
      [
        {
          id: "prescription-id",
          plannedBlockId: "block-id",
          position: 1,
          details: { sets: 4, repetitions: 4 },
          notes: null,
          movementId: "movement-id",
          movementCode: "power-clean",
          movementName: "Power clean",
          complexVersionId: null,
          complexCode: null,
          complexName: null,
          complexVersionNumber: null,
        },
        {
          id: "complex-prescription-id",
          plannedBlockId: "block-id",
          position: 2,
          details: { rounds: 3 },
          notes: "Complejo técnico",
          movementId: null,
          movementCode: null,
          movementName: null,
          complexVersionId: "complex-version-id",
          complexCode: "clean-complex",
          complexName: "Complejo de clean",
          complexVersionNumber: 2,
        },
      ],
    ]);

    await expect(createPlanningWeekReader(database).getWeek("2026-10-19")).resolves.toEqual({
      id: "week-id",
      trainingPlanId: "plan-id",
      planVersionId: "version-id",
      planTitle: "Plan de prueba",
      weekStart: "2026-10-19",
      title: "Semana 1",
      priorities: "Fuerza",
      sessions: [
        expect.objectContaining({
          id: "session-id",
          blocks: [
            expect.objectContaining({
              id: "block-id",
              blockType: { id: "block-type-id", code: "strength", description: "Fuerza" },
              prescriptions: [
                expect.objectContaining({
                  id: "prescription-id",
                  movement: { id: "movement-id", code: "power-clean", name: "Power clean" },
                  complex: null,
                }),
                expect.objectContaining({
                  id: "complex-prescription-id",
                  movement: null,
                  complex: {
                    id: "complex-version-id",
                    code: "clean-complex",
                    name: "Complejo de clean",
                    versionNumber: 2,
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });
  });

  it("returns null when no published week exists", async () => {
    const { database, select } = fakeDatabase([[]]);
    await expect(createPlanningWeekReader(database).getWeek("2026-10-19")).resolves.toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("does not query children for an empty week", async () => {
    const { database, select } = fakeDatabase([
      [
        {
          id: "week-id",
          trainingPlanId: "plan-id",
          planVersionId: "version-id",
          planTitle: "Plan vacío",
          weekStart: "2026-10-19",
          title: null,
          priorities: null,
        },
      ],
      [],
    ]);

    const result = await createPlanningWeekReader(database).getWeek("2026-10-19");
    expect(result?.sessions).toEqual([]);
    expect(select).toHaveBeenCalledTimes(2);
  });
});
