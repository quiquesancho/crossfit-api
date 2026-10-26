import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../db/client.js";
import { decodeHistoryCursor } from "./history.cursor.js";
import { createExecutionHistoryReader } from "./history.repository.js";

function resultQuery(result: unknown[]) {
  const resolved = Promise.resolve(result);
  const query: Record<string, unknown> = {
    from: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    where: () => query,
    orderBy: () => query,
    groupBy: () => query,
    limit: () => resolved,
    then: resolved.then.bind(resolved),
  };
  return query;
}

function fakeDatabase(results: unknown[][]) {
  const select = vi.fn(() => resultQuery(results.shift() ?? []));
  return { database: { select } as unknown as Database, select };
}

const executionRow = {
  id: "019b4e0a-0000-7000-8000-000000000101",
  executionDate: "2026-10-20",
  status: "completed",
  plannedSessionId: "019b4e0a-0000-7000-8000-000000000041",
  plannedSessionTitle: "Fuerza y WOD",
  revision: 2,
  updatedAt: new Date("2026-10-20T13:00:00.000Z"),
};

describe("execution history reader", () => {
  it("composes summaries with block counts and session RPE", async () => {
    const { database } = fakeDatabase([
      [executionRow],
      [{ sessionExecutionId: executionRow.id, total: 3 }],
      [{ sessionExecutionId: executionRow.id, rpe: 8 }],
    ]);

    const page = await createExecutionHistoryReader(database).listExecutions({ limit: 25 });

    expect(page).toEqual({
      items: [
        {
          id: executionRow.id,
          executionDate: "2026-10-20",
          status: "completed",
          origin: "planned",
          title: "Fuerza y WOD",
          plannedSessionId: executionRow.plannedSessionId,
          blockCount: 3,
          rpe: 8,
          revision: 2,
          updatedAt: "2026-10-20T13:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
  });

  it("returns a free training fallback and a cursor for the next page", async () => {
    const freeRow = {
      ...executionRow,
      id: "019b4e0a-0000-7000-8000-000000000102",
      plannedSessionId: null,
      plannedSessionTitle: null,
      status: "draft",
    };
    const { database } = fakeDatabase([
      [executionRow, freeRow],
      [],
      [],
    ]);

    const page = await createExecutionHistoryReader(database).listExecutions({ limit: 1 });

    expect(page.items).toEqual([
      expect.objectContaining({ origin: "planned", blockCount: 0, rpe: null }),
    ]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeHistoryCursor(page.nextCursor!)).toEqual({
      executionDate: "2026-10-20",
      id: executionRow.id,
    });
  });

  it("returns an empty page without extra queries", async () => {
    const { database, select } = fakeDatabase([[]]);

    await expect(
      createExecutionHistoryReader(database).listExecutions({ limit: 25 }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(select).toHaveBeenCalledTimes(1);
  });
});

describe("execution calendar reader", () => {
  it("merges the latest published sessions with executions by date", async () => {
    const { database } = fakeDatabase([
      [
        {
          id: "session-new",
          plannedDate: "2026-10-20",
          externalId: "session-1",
          title: "Fuerza y WOD",
          objective: "Técnica sólida.",
        },
        {
          id: "session-old",
          plannedDate: "2026-10-20",
          externalId: "session-1",
          title: "Versión anterior",
          objective: null,
        },
        {
          id: "session-2",
          plannedDate: "2026-10-22",
          externalId: "session-2",
          title: "Engine",
          objective: null,
        },
      ],
      [executionRow],
      [{ sessionExecutionId: executionRow.id, total: 3 }],
      [{ sessionExecutionId: executionRow.id, rpe: null }],
    ]);

    const calendar = await createExecutionHistoryReader(database).getCalendar(
      "2026-10-19",
      "2026-10-25",
    );

    expect(calendar.days).toEqual([
      {
        date: "2026-10-20",
        planned: [
          { id: "session-new", title: "Fuerza y WOD", objective: "Técnica sólida." },
        ],
        executions: [
          expect.objectContaining({
            id: executionRow.id,
            blockCount: 3,
            rpe: null,
            origin: "planned",
          }),
        ],
      },
      {
        date: "2026-10-22",
        planned: [{ id: "session-2", title: "Engine", objective: null }],
        executions: [],
      },
    ]);
  });

  it("includes execution-only dates", async () => {
    const { database } = fakeDatabase([
      [],
      [{ ...executionRow, plannedSessionId: null, plannedSessionTitle: null }],
      [],
      [],
    ]);

    const calendar = await createExecutionHistoryReader(database).getCalendar(
      "2026-10-19",
      "2026-10-25",
    );

    expect(calendar.days).toEqual([
      {
        date: "2026-10-20",
        planned: [],
        executions: [expect.objectContaining({ origin: "free", title: "Entrenamiento libre" })],
      },
    ]);
  });
});
