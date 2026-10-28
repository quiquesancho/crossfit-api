import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../db/client.js";
import { movement, movementFamily } from "../../db/schema.js";
import { createMovementCatalogWriter } from "./movement-catalog.writer.js";
import {
  MovementCatalogConflictError,
  MovementCatalogValidationError,
  type MovementCatalogImport,
} from "./movement-catalog.types.js";

type InsertCapture = { table: unknown; values: unknown };

function fakeDatabase(selectResults: unknown[][]) {
  const inserts: InsertCapture[] = [];
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => {
      const result = selectResults.shift() ?? [];
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: () => Promise.resolve(result),
      };
      return query;
    }),
    insert: vi.fn((table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        if (table === movementFamily) {
          const rows = (values as Array<{ code: string }>).map(({ code }) => ({
            id: `family-${code}`,
            code,
          }));
          return {
            onConflictDoUpdate: () => ({ returning: async () => rows }),
          };
        }
        return {
          onConflictDoUpdate: async () => undefined,
        };
      },
    })),
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as Database;
  return { database, inserts, tx };
}

const importInput: MovementCatalogImport = {
  families: [{ code: "clean", name: "Clean" }],
  movements: [{ code: "power-clean", name: "Power clean", familyCode: "clean" }],
};

describe("movement catalog writer", () => {
  it("creates families and movements in one transaction", async () => {
    const { database, inserts } = fakeDatabase([[], []]);

    const result = await createMovementCatalogWriter(database).importCatalog(importInput);

    expect(result).toEqual({
      status: "applied",
      families: { created: 1, updated: 0, unchanged: 0 },
      movements: { created: 1, updated: 0, unchanged: 0 },
    });
    expect(inserts).toEqual([
      { table: movementFamily, values: [{ code: "clean", name: "Clean" }] },
      {
        table: movement,
        values: [{ code: "power-clean", name: "Power clean", familyId: "family-clean" }],
      },
    ]);
  });

  it("reports unchanged entries without changing them", async () => {
    const { database } = fakeDatabase([
      [{ id: "family-clean", code: "clean", name: "Clean", archivedAt: null }],
      [
        {
          id: "movement-power-clean",
          code: "power-clean",
          name: "Power clean",
          familyId: "family-clean",
          familyCode: "clean",
          archivedAt: null,
        },
      ],
    ]);

    const result = await createMovementCatalogWriter(database).importCatalog(importInput);

    expect(result).toEqual({
      status: "applied",
      families: { created: 0, updated: 0, unchanged: 1 },
      movements: { created: 0, updated: 0, unchanged: 1 },
    });
  });

  it("rejects changing an existing movement family", async () => {
    const { database, inserts } = fakeDatabase([
      [],
      [
        {
          id: "movement-power-clean",
          code: "power-clean",
          name: "Power clean",
          familyId: "family-clean",
          familyCode: "clean",
          archivedAt: null,
        },
      ],
    ]);

    await expect(
      createMovementCatalogWriter(database).importCatalog({
        families: [{ code: "snatch", name: "Snatch" }],
        movements: [{ code: "power-clean", name: "Power clean", familyCode: "snatch" }],
      }),
    ).rejects.toMatchObject({
      constructor: MovementCatalogConflictError,
      code: "movement_family_conflict",
      details: {
        movementCode: "power-clean",
        currentFamilyCode: "clean",
        requestedFamilyCode: "snatch",
      },
    });
    expect(inserts).toEqual([]);
  });

  it("rejects an archived family", async () => {
    const { database, inserts } = fakeDatabase([
      [{ id: "family-clean", code: "clean", name: "Clean", archivedAt: new Date() }],
    ]);

    await expect(createMovementCatalogWriter(database).importCatalog(importInput)).rejects.toMatchObject({
      constructor: MovementCatalogConflictError,
      code: "family_archived",
    });
    expect(inserts).toEqual([]);
  });

  it("rejects an archived movement", async () => {
    const { database, inserts } = fakeDatabase([
      [{ id: "family-clean", code: "clean", name: "Clean", archivedAt: null }],
      [
        {
          id: "movement-power-clean",
          code: "power-clean",
          name: "Power clean",
          familyId: "family-clean",
          familyCode: "clean",
          archivedAt: new Date(),
        },
      ],
    ]);

    await expect(createMovementCatalogWriter(database).importCatalog(importInput)).rejects.toMatchObject({
      constructor: MovementCatalogConflictError,
      code: "movement_archived",
    });
    expect(inserts).toEqual([]);
  });

  it("rejects a movement that references an unknown family", async () => {
    const { database, inserts } = fakeDatabase([[]]);

    await expect(
      createMovementCatalogWriter(database).importCatalog({
        families: [],
        movements: [{ code: "snatch", name: "Snatch", familyCode: "snatch" }],
      }),
    ).rejects.toMatchObject({
      constructor: MovementCatalogValidationError,
      issues: [expect.objectContaining({ path: "movements[0].familyCode" })],
    });
    expect(inserts).toEqual([]);
  });
});
