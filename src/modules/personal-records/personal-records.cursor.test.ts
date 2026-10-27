import { describe, expect, it } from "vitest";

import {
  decodePersonalRecordCursor,
  encodePersonalRecordCursor,
} from "./personal-records.cursor.js";

describe("personal record cursor", () => {
  it("round-trips an opaque cursor", () => {
    const cursor = {
      achievedOn: "2026-10-20",
      id: "019b4e0a-0000-7000-8000-000000000301",
    };

    const encoded = encodePersonalRecordCursor(cursor);

    expect(encoded).not.toContain("{");
    expect(decodePersonalRecordCursor(encoded)).toEqual(cursor);
  });

  it.each([
    ["", null],
    ["not-a-cursor", null],
    [Buffer.from(JSON.stringify({ achievedOn: "2026-02-30", id: "x" })).toString("base64url"), null],
    [
      Buffer.from(
        JSON.stringify({ achievedOn: "2026-10-20", id: "019b4e0a-0000-7000-8000-00000000030z" }),
      ).toString("base64url"),
      null,
    ],
    [
      Buffer.from(JSON.stringify({ achievedOn: "2026-10-20" })).toString("base64url"),
      null,
    ],
    [Buffer.from(JSON.stringify(["2026-10-20", "id"])).toString("base64url"), null],
  ])("rejects an invalid cursor %#", (value, expected) => {
    expect(decodePersonalRecordCursor(value)).toBe(expected);
  });
});
