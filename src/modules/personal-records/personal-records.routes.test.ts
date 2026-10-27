import { afterAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import { encodePersonalRecordCursor } from "./personal-records.cursor.js";
import {
  PersonalRecordConflictError,
  PersonalRecordNotFoundError,
  PersonalRecordValidationError,
  type PersonalRecordReader,
  type PersonalRecordView,
  type PersonalRecordWriter,
} from "./personal-records.types.js";

const movementId = "019b4e0a-0000-7000-8000-000000000010";
const attemptId = "019b4e0a-0000-7000-8000-000000000201";
const record: PersonalRecordView = {
  id: "019b4e0a-0000-7000-8000-000000000301",
  status: "suggested",
  sourceType: "attempt",
  movement: { id: movementId, code: "power-clean", name: "Power clean" },
  complex: null,
  repetitions: 2,
  loadKg: 85,
  achievedOn: "2026-10-20",
  confirmedAt: null,
  note: null,
  originAttemptId: attemptId,
  previousLoadKg: 80,
};

function reader() {
  return {
    list: vi.fn().mockResolvedValue({ items: [record], nextCursor: null }),
    listCurrent: vi.fn().mockResolvedValue([record]),
    listSuggestions: vi.fn().mockResolvedValue([record]),
  } satisfies PersonalRecordReader;
}

function writer() {
  return {
    createManual: vi.fn().mockResolvedValue(record),
    decide: vi.fn().mockResolvedValue(record),
  } satisfies PersonalRecordWriter;
}

describe("personal record query routes", () => {
  const records = reader();
  const app = buildApp({ personalRecordReader: records });
  afterAll(async () => app.close());

  it("lists history with defaults", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/personal-records" });

    expect(response.statusCode).toBe(200);
    expect(records.list).toHaveBeenCalledWith({
      movementId: undefined,
      complexVersionId: undefined,
      status: undefined,
      cursor: undefined,
      limit: 25,
    });
    expect(response.json()).toEqual({ items: [record], nextCursor: null });
  });

  it("accepts filters, a cursor and a custom limit", async () => {
    const cursor = encodePersonalRecordCursor({
      achievedOn: "2026-10-20",
      id: record.id,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/personal-records?movementId=${movementId}&status=confirmed&cursor=${cursor}&limit=10`,
    });

    expect(response.statusCode).toBe(200);
    expect(records.list).toHaveBeenLastCalledWith({
      movementId,
      complexVersionId: undefined,
      status: "confirmed",
      cursor: { achievedOn: "2026-10-20", id: record.id },
      limit: 10,
    });
  });

  it.each([
    ["movementId=not-a-uuid", "movementId"],
    ["complexVersionId=not-a-uuid", "complexVersionId"],
    [`movementId=${movementId}&complexVersionId=${movementId}`, "movementId"],
    ["status=pending", "status"],
    ["limit=0", "limit"],
    ["limit=101", "limit"],
    ["limit=many", "limit"],
    ["cursor=not-a-cursor", "cursor"],
  ])("rejects invalid query %s", async (query, path) => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/personal-records?${query}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "validation_error",
        issues: [expect.objectContaining({ path })],
      }),
    );
  });

  it("returns current records", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/personal-records/current",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ records: [record] });
    expect(records.listCurrent).toHaveBeenCalled();
  });

  it("returns pending suggestions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/personal-records/suggestions",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [record] });
    expect(records.listSuggestions).toHaveBeenCalled();
  });
});

describe("personal record write routes", () => {
  const records = reader();
  const writes = writer();
  const app = buildApp({ personalRecordReader: records, personalRecordWriter: writes });
  afterAll(async () => app.close());

  it("creates a manual movement record", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/personal-records/${record.id}`,
      payload: {
        movementId,
        repetitions: 2,
        loadKg: 85,
        achievedOn: "2026-10-20",
        note: "Primera vez",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(writes.createManual).toHaveBeenCalledWith(record.id, {
      movementId,
      complexVersionId: undefined,
      repetitions: 2,
      loadKg: 85,
      achievedOn: "2026-10-20",
      note: "Primera vez",
    });
    expect(response.json()).toEqual(record);
  });

  it("creates a manual complex record", async () => {
    const complexVersionId = "019b4e0a-0000-7000-8000-000000000020";
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/personal-records/${record.id}`,
      payload: { complexVersionId, repetitions: 1, loadKg: 100, achievedOn: "2026-10-19" },
    });

    expect(response.statusCode).toBe(200);
    expect(writes.createManual).toHaveBeenLastCalledWith(record.id, {
      movementId: undefined,
      complexVersionId,
      repetitions: 1,
      loadKg: 100,
      achievedOn: "2026-10-19",
      note: undefined,
    });
  });

  it.each([
    [{ repetitions: 2, loadKg: 85, achievedOn: "2026-10-20" }, "movementId"],
    [
      {
        movementId,
        complexVersionId: "019b4e0a-0000-7000-8000-000000000020",
        repetitions: 2,
        loadKg: 85,
        achievedOn: "2026-10-20",
      },
      "movementId",
    ],
    [{ movementId, repetitions: 0, loadKg: 85, achievedOn: "2026-10-20" }, "repetitions"],
    [{ movementId, repetitions: 2, loadKg: -1, achievedOn: "2026-10-20" }, "loadKg"],
    [{ movementId, repetitions: 2, loadKg: 85, achievedOn: "20-10-2026" }, "achievedOn"],
    [{ movementId, repetitions: 2, loadKg: 85, achievedOn: "2026-10-20", note: 3 }, "note"],
  ])("rejects invalid manual record body %#", async (payload, path) => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/personal-records/${record.id}`,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "validation_error",
        issues: [expect.objectContaining({ path })],
      }),
    );
  });

  it("maps writer validation and conflicts", async () => {
    writes.createManual.mockRejectedValueOnce(
      new PersonalRecordValidationError([{ path: "movementId", message: "Unknown." }]),
    );
    const invalid = await app.inject({
      method: "PUT",
      url: `/api/v1/personal-records/${record.id}`,
      payload: { movementId, repetitions: 2, loadKg: 85, achievedOn: "2026-10-20" },
    });
    expect(invalid.statusCode).toBe(400);

    writes.createManual.mockRejectedValueOnce(
      new PersonalRecordConflictError("manual_record_immutable", "Not manual."),
    );
    const conflict = await app.inject({
      method: "PUT",
      url: `/api/v1/personal-records/${record.id}`,
      payload: { movementId, repetitions: 2, loadKg: 85, achievedOn: "2026-10-20" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ code: "manual_record_immutable", message: "Not manual." });
  });

  it("confirms a suggestion", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/personal-records/${record.id}`,
      payload: { status: "confirmed" },
    });

    expect(response.statusCode).toBe(200);
    expect(writes.decide).toHaveBeenCalledWith(record.id, "confirmed");
  });

  it("discards a suggestion", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/personal-records/${record.id}`,
      payload: { status: "discarded" },
    });

    expect(response.statusCode).toBe(200);
    expect(writes.decide).toHaveBeenLastCalledWith(record.id, "discarded");
  });

  it("rejects an invalid decision", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/personal-records/${record.id}`,
      payload: { status: "suggested" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "validation_error",
        issues: [{ path: "status", message: "Must be confirmed or discarded." }],
      }),
    );
  });

  it("maps not found and not better than current", async () => {
    writes.decide.mockRejectedValueOnce(new PersonalRecordNotFoundError());
    const missing = await app.inject({
      method: "PATCH",
      url: `/api/v1/personal-records/${record.id}`,
      payload: { status: "confirmed" },
    });
    expect(missing.statusCode).toBe(404);

    writes.decide.mockRejectedValueOnce(
      new PersonalRecordConflictError("not_better_than_current", "Not better."),
    );
    const conflict = await app.inject({
      method: "PATCH",
      url: `/api/v1/personal-records/${record.id}`,
      payload: { status: "confirmed" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ code: "not_better_than_current", message: "Not better." });
  });
});

describe("personal record service availability", () => {
  const app = buildApp();
  afterAll(async () => app.close());

  it("returns 503 when the reader is unavailable", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/personal-records" });
    expect(response.statusCode).toBe(503);
  });

  it("returns 503 when the writer is unavailable", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/personal-records/${record.id}`,
      payload: { status: "confirmed" },
    });
    expect(response.statusCode).toBe(503);
  });
});
