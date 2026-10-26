import { describe, expect, it } from "vitest";

import { decodeHistoryCursor, encodeHistoryCursor } from "./history.cursor.js";

describe("execution history cursor", () => {
  const cursor = {
    executionDate: "2026-10-20",
    id: "019b4e0a-0000-7000-8000-000000000101",
  };

  it("round-trips an opaque cursor", () => {
    const encoded = encodeHistoryCursor(cursor);

    expect(encoded).not.toContain("2026-10-20");
    expect(decodeHistoryCursor(encoded)).toEqual(cursor);
  });

  it.each([
    ["not-base64", "not-a-cursor"],
    ["invalid json", Buffer.from("{", "utf8").toString("base64url")],
    ["invalid date", Buffer.from(JSON.stringify({ ...cursor, executionDate: "2026-02-30" }), "utf8").toString("base64url")],
    ["invalid id", Buffer.from(JSON.stringify({ ...cursor, id: "execution-1" }), "utf8").toString("base64url")],
    ["array payload", Buffer.from(JSON.stringify([cursor]), "utf8").toString("base64url")],
    ["null payload", Buffer.from("null", "utf8").toString("base64url")],
  ])("rejects %s", (_label, value) => {
    expect(decodeHistoryCursor(value)).toBeNull();
  });
});
