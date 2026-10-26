import { isIsoDate } from "../planning/planning.validation.js";
import type { ExecutionHistoryCursor } from "./history.types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeHistoryCursor(cursor: ExecutionHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeHistoryCursor(value: string): ExecutionHistoryCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const { executionDate, id } = parsed as Record<string, unknown>;
    if (!isIsoDate(executionDate)) return null;
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) return null;
    return { executionDate, id };
  } catch {
    return null;
  }
}
