import { afterAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import type { ProgressReader } from "./progress.types.js";

const response = {
  from: "2026-10-01",
  to: "2026-10-31",
  groupBy: "movement" as const,
  totals: {
    repetitions: 120,
    technicalRepetitions: 80,
    durationSeconds: 300,
    technicalDurationSeconds: 240,
    volumeKg: 5400,
    technicalVolumeKg: 3200,
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
};

function reader() {
  return {
    getVolume: vi.fn().mockResolvedValue(response),
  } satisfies ProgressReader;
}

describe("progress volume route", () => {
  const progress = reader();
  const app = buildApp({ progressReader: progress });
  afterAll(async () => app.close());

  it("returns movement volume for a date range", async () => {
    const result = await app.inject({
      method: "GET",
      url: "/api/v1/progress/volume?from=2026-10-01&to=2026-10-31",
    });

    expect(result.statusCode).toBe(200);
    expect(progress.getVolume).toHaveBeenCalledWith({
      from: "2026-10-01",
      to: "2026-10-31",
      groupBy: "movement",
    });
    expect(result.json()).toEqual(response);
  });

  it("accepts family grouping", async () => {
    const result = await app.inject({
      method: "GET",
      url: "/api/v1/progress/volume?from=2026-10-01&to=2026-10-31&groupBy=family",
    });

    expect(result.statusCode).toBe(200);
    expect(progress.getVolume).toHaveBeenLastCalledWith({
      from: "2026-10-01",
      to: "2026-10-31",
      groupBy: "family",
    });
  });

  it.each([
    ["to=2026-10-31", "from"],
    ["from=2026-10-01", "to"],
    ["from=2026-02-30&to=2026-10-31", "from"],
    ["from=2026-10-31&to=2026-10-01", "from"],
    ["from=2025-01-01&to=2026-10-31", "to"],
    ["from=2026-10-01&to=2026-10-31&groupBy=pattern", "groupBy"],
  ])("rejects invalid query %s", async (query, path) => {
    const result = await app.inject({
      method: "GET",
      url: `/api/v1/progress/volume?${query}`,
    });

    expect(result.statusCode).toBe(400);
    expect(result.json()).toEqual(
      expect.objectContaining({
        code: "validation_error",
        issues: [expect.objectContaining({ path })],
      }),
    );
  });

  it("reports unavailable progress queries", async () => {
    const unavailable = buildApp();

    const result = await unavailable.inject({
      method: "GET",
      url: "/api/v1/progress/volume?from=2026-10-01&to=2026-10-31",
    });

    expect(result.statusCode).toBe(503);
    await unavailable.close();
  });
});
