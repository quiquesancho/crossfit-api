import { hashCanonicalJson } from "../../shared/hash.js";
import { normalizedSnapshot } from "./execution.snapshot.js";
import type { SessionExecutionSnapshot } from "./execution.types.js";

export function hashSessionExecution(snapshot: SessionExecutionSnapshot): string {
  const normalized = normalizedSnapshot(snapshot);
  return hashCanonicalJson({
    plannedSessionId: normalized.plannedSessionId,
    executionDate: normalized.executionDate,
    status: normalized.status,
    generalNote: normalized.generalNote,
    blocks: normalized.blocks,
  });
}
