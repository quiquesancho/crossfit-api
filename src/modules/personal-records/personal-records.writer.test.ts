import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../db/client.js";
import { createPersonalRecordWriter } from "./personal-records.writer.js";
import {
  PersonalRecordConflictError,
  PersonalRecordNotFoundError,
} from "./personal-records.types.js";

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
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const select = vi.fn(() => resultQuery(results.shift() ?? []));
  const insert = vi.fn(() => ({
    values: (values: Record<string, unknown>) => {
      inserted.push(values);
      return Promise.resolve();
    },
  }));
  const update = vi.fn(() => ({
    set: (values: Record<string, unknown>) => {
      updated.push(values);
      return { where: () => Promise.resolve() };
    },
  }));
  return {
    database: { select, insert, update } as unknown as Database,
    select,
    insert,
    update,
    inserted,
    updated,
  };
}

const athleteId = "019b4e0a-0000-7000-8000-000000000001";
const movementId = "019b4e0a-0000-7000-8000-000000000010";
const complexVersionId = "019b4e0a-0000-7000-8000-000000000020";
const recordId = "019b4e0a-0000-7000-8000-000000000301";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: recordId,
    status: "confirmed",
    sourceType: "manual_historical",
    setAttemptId: null,
    movementId,
    movementCode: "power-clean",
    movementName: "Power clean",
    complexVersionId: null,
    complexCode: null,
    complexName: null,
    complexVersionNumber: null,
    repetitions: 2,
    loadKg: 85,
    achievedOn: "2026-10-20",
    confirmedAt: new Date("2026-10-20T12:00:00.000Z"),
    note: "Primera vez",
    ...overrides,
  };
}

const input = {
  movementId,
  repetitions: 2,
  loadKg: 85,
  achievedOn: "2026-10-20",
  note: "Primera vez",
};

describe("personal record writer", () => {
  it("creates a confirmed manual movement record", async () => {
    const fake = fakeDatabase([
      [{ id: athleteId }],
      [{ id: movementId }],
      [],
      [row()],
    ]);
    const writer = createPersonalRecordWriter(fake.database);

    const view = await writer.createManual(recordId, input);

    expect(fake.inserted).toEqual([
      expect.objectContaining({
        id: recordId,
        athleteId,
        movementId,
        complexVersionId: null,
        setAttemptId: null,
        status: "confirmed",
        sourceType: "manual_historical",
        confirmedAt: expect.any(Date),
      }),
    ]);
    expect(view.movement?.name).toBe("Power clean");
  });

  it("validates a published complex version", async () => {
    const fake = fakeDatabase([
      [{ id: athleteId }],
      [{ id: complexVersionId }],
      [],
      [
        row({
          movementId: null,
          movementCode: null,
          movementName: null,
          complexVersionId,
          complexCode: "clean-complex",
          complexName: "Clean complex",
          complexVersionNumber: 1,
        }),
      ],
    ]);
    const writer = createPersonalRecordWriter(fake.database);

    const view = await writer.createManual(recordId, {
      complexVersionId,
      repetitions: 1,
      loadKg: 100,
      achievedOn: "2026-10-19",
    });

    expect(fake.inserted[0]).toEqual(
      expect.objectContaining({ complexVersionId, movementId: null }),
    );
    expect(view.complex?.versionNumber).toBe(1);
  });

  it("updates an existing manual record", async () => {
    const fake = fakeDatabase([
      [{ id: athleteId }],
      [{ id: movementId }],
      [{ id: recordId, athleteId, sourceType: "manual_historical" }],
      [row({ loadKg: 90 })],
    ]);
    const writer = createPersonalRecordWriter(fake.database);

    const view = await writer.createManual(recordId, { ...input, loadKg: 90 });

    expect(fake.insert).not.toHaveBeenCalled();
    expect(fake.updated).toEqual([
      expect.objectContaining({ loadKg: 90, status: "confirmed" }),
    ]);
    expect(view.loadKg).toBe(90);
  });

  it("rejects an attempt-originated record", async () => {
    const fake = fakeDatabase([
      [{ id: athleteId }],
      [{ id: movementId }],
      [{ id: recordId, athleteId, sourceType: "attempt" }],
    ]);
    const writer = createPersonalRecordWriter(fake.database);

    await expect(writer.createManual(recordId, input)).rejects.toBeInstanceOf(
      PersonalRecordConflictError,
    );
  });

  it("rejects a record identifier owned by another athlete", async () => {
    const fake = fakeDatabase([
      [{ id: athleteId }],
      [{ id: movementId }],
      [{ id: recordId, athleteId: "other", sourceType: "manual_historical" }],
    ]);
    const writer = createPersonalRecordWriter(fake.database);

    await expect(writer.createManual(recordId, input)).rejects.toMatchObject({
      code: "record_id_conflict",
    });
  });

  it("confirms a suggestion that beats the current record", async () => {
    const fake = fakeDatabase([
      [{ id: athleteId }],
      [row({ status: "suggested", sourceType: "attempt", loadKg: 85, confirmedAt: null })],
      [{ loadKg: 80 }],
      [row({ status: "confirmed", sourceType: "attempt", loadKg: 85 })],
    ]);
    const writer = createPersonalRecordWriter(fake.database);

    const view = await writer.decide(recordId, "confirmed");

    expect(fake.updated).toEqual([
      expect.objectContaining({ status: "confirmed", confirmedAt: expect.any(Date) }),
    ]);
    expect(view.status).toBe("confirmed");
  });

  it("rejects a suggestion that does not beat the current record", async () => {
    const fake = fakeDatabase([
      [{ id: athleteId }],
      [row({ status: "suggested", sourceType: "attempt", loadKg: 85, confirmedAt: null })],
      [{ loadKg: 85 }],
    ]);
    const writer = createPersonalRecordWriter(fake.database);

    await expect(writer.decide(recordId, "confirmed")).rejects.toMatchObject({
      code: "not_better_than_current",
    });
  });

  it("discards a suggestion", async () => {
    const fake = fakeDatabase([
      [{ id: athleteId }],
      [row({ status: "suggested", sourceType: "attempt", confirmedAt: null })],
      [row({ status: "discarded", sourceType: "attempt", confirmedAt: null })],
    ]);
    const writer = createPersonalRecordWriter(fake.database);

    const view = await writer.decide(recordId, "discarded");

    expect(fake.updated).toEqual([{ status: "discarded", confirmedAt: null, updatedAt: expect.any(Date) }]);
    expect(view.status).toBe("discarded");
  });

  it("is idempotent when the decision already matches", async () => {
    const fake = fakeDatabase([
      [{ id: athleteId }],
      [row({ status: "confirmed" })],
      [row({ status: "confirmed" })],
    ]);
    const writer = createPersonalRecordWriter(fake.database);

    const view = await writer.decide(recordId, "confirmed");

    expect(fake.update).not.toHaveBeenCalled();
    expect(view.status).toBe("confirmed");
  });

  it("reports a missing record", async () => {
    const fake = fakeDatabase([[{ id: athleteId }], []]);
    const writer = createPersonalRecordWriter(fake.database);

    await expect(writer.decide(recordId, "confirmed")).rejects.toBeInstanceOf(
      PersonalRecordNotFoundError,
    );
  });
});
