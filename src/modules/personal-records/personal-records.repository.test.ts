import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../db/client.js";
import { decodePersonalRecordCursor } from "./personal-records.cursor.js";
import { createPersonalRecordReader } from "./personal-records.repository.js";

function resultQuery(result: unknown[]) {
  const resolved = Promise.resolve(result);
  const query: Record<string, unknown> = {
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

const movementId = "019b4e0a-0000-7000-8000-000000000010";
const complexVersionId = "019b4e0a-0000-7000-8000-000000000020";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "019b4e0a-0000-7000-8000-000000000301",
    status: "confirmed",
    sourceType: "attempt",
    setAttemptId: "019b4e0a-0000-7000-8000-000000000201",
    movementId,
    movementCode: "power-clean",
    movementName: "Power clean",
    complexVersionId: null,
    complexCode: null,
    complexName: null,
    complexVersionNumber: null,
    repetitions: 2,
    loadKg: 80,
    achievedOn: "2026-10-20",
    confirmedAt: new Date("2026-10-20T12:00:00.000Z"),
    note: null,
    ...overrides,
  };
}

describe("personal record reader", () => {
  it("paginates history and exposes an opaque cursor", async () => {
    const first = row({ id: "019b4e0a-0000-7000-8000-000000000301", achievedOn: "2026-10-21" });
    const second = row({ id: "019b4e0a-0000-7000-8000-000000000302", achievedOn: "2026-10-20" });
    const third = row({ id: "019b4e0a-0000-7000-8000-000000000303", achievedOn: "2026-10-19" });
    const { database } = fakeDatabase([
      [{ id: "athlete-id" }],
      [first, second, third],
    ]);
    const reader = createPersonalRecordReader(database);

    const page = await reader.list({ limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.movement).toEqual({
      id: movementId,
      code: "power-clean",
      name: "Power clean",
    });
    expect(page.items[0]?.confirmedAt).toBe("2026-10-20T12:00:00.000Z");
    expect(page.nextCursor).not.toBeNull();
    expect(decodePersonalRecordCursor(page.nextCursor!)).toEqual({
      achievedOn: "2026-10-20",
      id: second.id,
    });
  });

  it("returns the best confirmed load per anchor and repetition count", async () => {
    const heavier = row({ id: "019b4e0a-0000-7000-8000-000000000302", loadKg: 85 });
    const tiedEarlier = row({
      id: "019b4e0a-0000-7000-8000-000000000303",
      loadKg: 85,
      achievedOn: "2026-10-18",
    });
    const complex = row({
      id: "019b4e0a-0000-7000-8000-000000000304",
      movementId: null,
      movementCode: null,
      movementName: null,
      complexVersionId,
      complexCode: "clean-complex",
      complexName: "Clean complex",
      complexVersionNumber: 1,
      repetitions: 1,
      loadKg: 100,
    });
    const { database } = fakeDatabase([
      [{ id: "athlete-id" }],
      [heavier, tiedEarlier, complex],
    ]);
    const reader = createPersonalRecordReader(database);

    const records = await reader.listCurrent();

    expect(records).toHaveLength(2);
    expect(records.find((record) => record.movement)?.loadKg).toBe(85);
    expect(records.find((record) => record.complex)?.complex).toEqual({
      id: complexVersionId,
      code: "clean-complex",
      name: "Clean complex",
      versionNumber: 1,
    });
  });

  it("keeps the best suggestion per anchor and compares it with confirmed loads", async () => {
    const best = row({
      id: "019b4e0a-0000-7000-8000-000000000305",
      status: "suggested",
      loadKg: 85,
      confirmedAt: null,
    });
    const lower = row({
      id: "019b4e0a-0000-7000-8000-000000000306",
      status: "suggested",
      loadKg: 82,
      confirmedAt: null,
    });
    const noReference = row({
      id: "019b4e0a-0000-7000-8000-000000000307",
      status: "suggested",
      loadKg: 90,
      repetitions: 1,
      achievedOn: "2026-10-19",
      confirmedAt: null,
    });
    const confirmed = row({ loadKg: 80 });
    const { database } = fakeDatabase([
      [{ id: "athlete-id" }],
      [best, lower, noReference],
      [confirmed],
    ]);
    const reader = createPersonalRecordReader(database);

    const suggestions = await reader.listSuggestions();

    expect(suggestions).toHaveLength(2);
    expect(suggestions.find((record) => record.repetitions === 2)).toEqual(
      expect.objectContaining({ loadKg: 85, previousLoadKg: 80 }),
    );
    expect(suggestions.find((record) => record.repetitions === 1)).toEqual(
      expect.objectContaining({ loadKg: 90, previousLoadKg: null }),
    );
  });
});
