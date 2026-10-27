import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../db/client.js";
import { createProgressReader } from "./progress.repository.js";

function resultQuery(result: unknown[]) {
  const resolved = Promise.resolve(result);
  const query: Record<string, unknown> = {
    from: () => query,
    where: () => query,
    limit: () => resolved,
    then: resolved.then.bind(resolved),
  };
  return query;
}

function fakeDatabase(items: unknown[], totals: unknown[]) {
  const select = vi.fn(() => resultQuery([{ id: "athlete-id" }]));
  const execute = vi
    .fn()
    .mockResolvedValueOnce({ rows: items })
    .mockResolvedValueOnce({ rows: totals });
  return { database: { select, execute } as unknown as Database, select, execute };
}

const itemRow = {
  movement_id: "movement-id",
  movement_code: "power-clean",
  movement_name: "Power clean",
  family_id: "family-id",
  family_code: "clean",
  family_name: "Clean",
  repetitions: "40.000",
  technical_repetitions: "24.000",
  duration_seconds: "0.000",
  technical_duration_seconds: "0.000",
  volume_kg: "3400.000",
  technical_volume_kg: "2040.000",
  sessions: "3",
  last_practiced_on: "2026-10-30",
};

const totalsRow = {
  movement_id: null,
  movement_code: null,
  movement_name: null,
  family_id: "family-id",
  family_code: "clean",
  family_name: "Clean",
  repetitions: "120.000",
  technical_repetitions: "80.000",
  duration_seconds: "300.500",
  technical_duration_seconds: "240.250",
  volume_kg: "5400.125",
  technical_volume_kg: "3200.500",
  sessions: "4",
  last_practiced_on: "2026-10-30",
};

describe("progress reader", () => {
  it("maps movement aggregates and totals", async () => {
    const { database, execute } = fakeDatabase([itemRow], [totalsRow]);
    const reader = createProgressReader(database);

    const result = await reader.getVolume({
      from: "2026-10-01",
      to: "2026-10-31",
      groupBy: "movement",
    });

    expect(execute).toHaveBeenCalledTimes(2);
    const dialect = new PgDialect();
    const movementSql = dialect
      .sqlToQuery(execute.mock.calls[0]![0] as SQL)
      .sql.replace(/\s+/g, " ");
    expect(movementSql).toContain("with attempt_values as");
    expect(movementSql).toContain("group by movement_id");
    expect(movementSql).toContain("max(execution_date)::text as last_practiced_on");
    expect(result).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      groupBy: "movement",
      totals: {
        repetitions: 120,
        technicalRepetitions: 80,
        durationSeconds: 300.5,
        technicalDurationSeconds: 240.25,
        volumeKg: 5400.125,
        technicalVolumeKg: 3200.5,
        sessions: 4,
        lastPracticedOn: "2026-10-30",
      },
      items: [
        {
          movement: { id: "movement-id", code: "power-clean", name: "Power clean" },
          family: { id: "family-id", code: "clean", name: "Clean" },
          repetitions: 40,
          technicalRepetitions: 24,
          durationSeconds: 0,
          technicalDurationSeconds: 0,
          volumeKg: 3400,
          technicalVolumeKg: 2040,
          sessions: 3,
          lastPracticedOn: "2026-10-30",
        },
      ],
    });
  });

  it("maps family aggregates without a movement", async () => {
    const familyRow = {
      ...itemRow,
      movement_id: null,
      movement_code: null,
      movement_name: null,
    };
    const { database } = fakeDatabase([familyRow], [totalsRow]);
    const reader = createProgressReader(database);

    const result = await reader.getVolume({
      from: "2026-10-01",
      to: "2026-10-31",
      groupBy: "family",
    });

    expect(result.groupBy).toBe("family");
    expect(result.items[0]?.movement).toBeNull();
    expect(result.items[0]?.family).toEqual({
      id: "family-id",
      code: "clean",
      name: "Clean",
    });
  });

  it("returns an empty aggregate when there are no attempts", async () => {
    const { database } = fakeDatabase([], []);
    const reader = createProgressReader(database);

    const result = await reader.getVolume({
      from: "2026-10-01",
      to: "2026-10-31",
      groupBy: "movement",
    });

    expect(result.items).toEqual([]);
    expect(result.totals).toEqual({
      repetitions: 0,
      technicalRepetitions: 0,
      durationSeconds: 0,
      technicalDurationSeconds: 0,
      volumeKg: 0,
      technicalVolumeKg: 0,
      sessions: 0,
      lastPracticedOn: null,
    });
  });
});
