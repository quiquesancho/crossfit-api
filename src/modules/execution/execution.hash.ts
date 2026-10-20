import { hashCanonicalJson } from "../../shared/hash.js";
import type { SessionExecutionSnapshot } from "./execution.types.js";

export function hashSessionExecution(snapshot: SessionExecutionSnapshot): string {
  return hashCanonicalJson({
    plannedSessionId: snapshot.plannedSessionId,
    executionDate: snapshot.executionDate,
    status: snapshot.status,
    generalNote: snapshot.generalNote,
    blocks: snapshot.blocks,
  });
}
