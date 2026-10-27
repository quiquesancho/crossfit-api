import { describe, expect, it, vi } from "vitest";

import {
  generatePersonalRecordSuggestions,
  type DatabaseTransaction,
  type PersonalRecordAttempt,
} from "./personal-records.suggestions.js";

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

function fakeTransaction(results: unknown[][]) {
  const inserted: Record<string, unknown>[] = [];
  const select = vi.fn(() => resultQuery(results.shift() ?? []));
  const insert = vi.fn(() => ({
    values: (values: Record<string, unknown>) => {
      inserted.push(values);
      return { onConflictDoNothing: () => Promise.resolve() };
    },
  }));
  return {
    transaction: { select, insert } as unknown as DatabaseTransaction,
    select,
    insert,
    inserted,
  };
}

const movementId = "019b4e0a-0000-7000-8000-000000000010";

function attempt(overrides: Partial<PersonalRecordAttempt> = {}): PersonalRecordAttempt {
  return {
    id: "019b4e0a-0000-7000-8000-000000000201",
    movementId,
    status: "completed",
    position: 1,
    repetitions: 2,
    weight: { amount: 85, unit: "kg" },
    ...overrides,
  };
}

const input = {
  athleteId: "athlete-id",
  executionDate: "2026-10-20",
  executionStatus: "completed",
};

describe("personal record suggestions", () => {
  it("suggests a completed attempt that beats the confirmed reference", async () => {
    const fake = fakeTransaction([
      [],
      [
        {
          movementId,
          complexVersionId: null,
          repetitions: 2,
          loadKg: 80,
        },
      ],
    ]);

    await generatePersonalRecordSuggestions(fake.transaction, {
      ...input,
      attempts: [attempt()],
    });

    expect(fake.inserted).toEqual([
      expect.objectContaining({
        setAttemptId: attempt().id,
        movementId,
        complexVersionId: null,
        repetitions: 2,
        loadKg: 85,
        achievedOn: "2026-10-20",
        status: "suggested",
        sourceType: "attempt",
      }),
    ]);
  });

  it("keeps the best attempt per anchor and repetition count", async () => {
    const fake = fakeTransaction([[], []]);

    await generatePersonalRecordSuggestions(fake.transaction, {
      ...input,
      attempts: [
        attempt({ id: "019b4e0a-0000-7000-8000-000000000201", position: 1 }),
        attempt({
          id: "019b4e0a-0000-7000-8000-000000000202",
          position: 2,
          weight: { amount: 90, unit: "kg" },
        }),
        attempt({
          id: "019b4e0a-0000-7000-8000-000000000203",
          position: 3,
          repetitions: 1,
          weight: { amount: 100, unit: "kg" },
        }),
      ],
    });

    expect(fake.inserted).toHaveLength(2);
    expect(fake.inserted.map((record) => record.loadKg)).toEqual([90, 100]);
  });

  it("converts pounds to kilograms", async () => {
    const fake = fakeTransaction([[], []]);

    await generatePersonalRecordSuggestions(fake.transaction, {
      ...input,
      attempts: [attempt({ weight: { amount: 187.4, unit: "lb" } })],
    });

    expect(fake.inserted[0]?.loadKg).toBe(85.003);
  });

  it("ignores partial, failed and skipped attempts", async () => {
    const fake = fakeTransaction([[], []]);

    await generatePersonalRecordSuggestions(fake.transaction, {
      ...input,
      attempts: [
        attempt({ id: "019b4e0a-0000-7000-8000-000000000201", status: "partial" }),
        attempt({ id: "019b4e0a-0000-7000-8000-000000000202", status: "failed" }),
        attempt({ id: "019b4e0a-0000-7000-8000-000000000203", status: "skipped" }),
      ],
    });

    expect(fake.inserted).toHaveLength(0);
  });

  it("does not suggest an attempt the athlete already confirmed or discarded", async () => {
    const fake = fakeTransaction([
      [{ attemptId: attempt().id, loadKg: 85 }],
      [],
    ]);

    await generatePersonalRecordSuggestions(fake.transaction, {
      ...input,
      attempts: [attempt()],
    });

    expect(fake.inserted).toHaveLength(0);
  });

  it("does not suggest a load that does not beat the current reference", async () => {
    const fake = fakeTransaction([
      [],
      [{ movementId, complexVersionId: null, repetitions: 2, loadKg: 85 }],
    ]);

    await generatePersonalRecordSuggestions(fake.transaction, {
      ...input,
      attempts: [attempt()],
    });

    expect(fake.inserted).toHaveLength(0);
  });

  it.each(["draft", "annulled"])("does not generate suggestions for a %s session", async (status) => {
    const fake = fakeTransaction([[], []]);

    await generatePersonalRecordSuggestions(fake.transaction, {
      ...input,
      executionStatus: status,
      attempts: [attempt()],
    });

    expect(fake.inserted).toHaveLength(0);
  });
});
