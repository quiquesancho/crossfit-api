import { afterAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import { encodeHistoryCursor } from "./history.cursor.js";
import type { ExecutionHistoryReader } from "./history.types.js";

const summary = {
  id: "019b4e0a-0000-7000-8000-000000000101",
  executionDate: "2026-10-20",
  status: "completed" as const,
  origin: "planned" as const,
  title: "Fuerza y WOD",
  plannedSessionId: "019b4e0a-0000-7000-8000-000000000041",
  blockCount: 3,
  rpe: 8,
  revision: 2,
  updatedAt: "2026-10-20T13:00:00.000Z",
};

function reader() {
  return {
    listExecutions: vi.fn().mockResolvedValue({ items: [summary], nextCursor: null }),
    getCalendar: vi.fn().mockResolvedValue({
      days: [{ date: "2026-10-20", planned: [], executions: [summary] }],
    }),
  } satisfies ExecutionHistoryReader;
}

describe("execution history route", () => {
  const history = reader();
  const app = buildApp({ executionHistoryReader: history });
  afterAll(async () => app.close());

  it("returns a cursor-paginated page with defaults", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/session-executions?from=2026-10-01&to=2026-10-31",
    });

    expect(response.statusCode).toBe(200);
    expect(history.listExecutions).toHaveBeenCalledWith({
      from: "2026-10-01",
      to: "2026-10-31",
      cursor: undefined,
      limit: 25,
    });
    expect(response.json()).toEqual({ items: [summary], nextCursor: null });
  });

  it("accepts a cursor and a custom limit", async () => {
    const cursor = encodeHistoryCursor({
      executionDate: "2026-10-20",
      id: "019b4e0a-0000-7000-8000-000000000101",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/session-executions?cursor=${cursor}&limit=10`,
    });

    expect(response.statusCode).toBe(200);
    expect(history.listExecutions).toHaveBeenLastCalledWith({
      from: undefined,
      to: undefined,
      cursor: { executionDate: "2026-10-20", id: summary.id },
      limit: 10,
    });
  });

  it.each([
    ["from=2026-02-30", "from"],
    ["to=20-10-2026", "to"],
    ["from=2026-10-31&to=2026-10-01", "to"],
    ["from=2025-01-01&to=2026-10-01", "to"],
    ["limit=0", "limit"],
    ["limit=101", "limit"],
    ["limit=many", "limit"],
    ["cursor=not-a-cursor", "cursor"],
  ])("rejects invalid query %s", async (query, path) => {
    const response = await app.inject({ method: "GET", url: `/api/v1/session-executions?${query}` });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "validation_error",
        issues: [expect.objectContaining({ path })],
      }),
    );
  });
});

describe("calendar route", () => {
  const history = reader();
  const app = buildApp({ executionHistoryReader: history });
  afterAll(async () => app.close());

  it("returns the days composed by the reader", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2026-10-01&to=2026-10-31",
    });

    expect(response.statusCode).toBe(200);
    expect(history.getCalendar).toHaveBeenCalledWith("2026-10-01", "2026-10-31");
    expect(response.json().days).toHaveLength(1);
  });

  it.each([
    ["to=2026-10-31", "from"],
    ["from=2026-10-01", "to"],
    ["from=2026-10-31&to=2026-10-01", "from"],
    ["from=2025-01-01&to=2026-10-01", "to"],
  ])("rejects invalid range %s", async (query, path) => {
    const response = await app.inject({ method: "GET", url: `/api/v1/calendar?${query}` });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "validation_error",
        issues: [expect.objectContaining({ path })],
      }),
    );
  });
});

describe("history routes without persistence", () => {
  const app = buildApp();
  afterAll(async () => app.close());

  it("returns 503 for the calendar", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2026-10-01&to=2026-10-31",
    });

    expect(response.statusCode).toBe(503);
  });

  it("returns 503 for the history", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/session-executions" });

    expect(response.statusCode).toBe(503);
  });
});
