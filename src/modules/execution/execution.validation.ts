import type {
  BlockExecutionSnapshot,
  BlockExecutionStatus,
  ExecutionValidationIssue,
  SessionExecutionSnapshot,
  SessionExecutionStatus,
} from "./execution.types.js";
import { isIsoDate } from "../planning/planning.validation.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_STATUSES = new Set<SessionExecutionStatus>(["draft", "completed", "annulled"]);
const BLOCK_STATUSES = new Set<BlockExecutionStatus>([
  "draft",
  "completed",
  "completed_without_metric",
  "partial",
  "skipped",
  "abandoned",
]);
const LOAD_STATUSES = new Set(["rx", "scaled"]);
const METRIC_KEYS = new Set(["rounds", "extraRepetitions", "prescriptions"]);
const PRESCRIPTION_METRIC_KEYS = new Set([
  "plannedPrescriptionId",
  "actualWeight",
  "loadStatus",
]);
const WEIGHT_KEYS = new Set(["amount", "unit"]);

type ObjectValue = Record<string, unknown>;

function isObject(value: unknown): value is ObjectValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalStringIssue(issues: ExecutionValidationIssue[], value: unknown, path: string) {
  if (value !== undefined && typeof value !== "string") issues.push({ path, message: "Must be a string." });
}

function uuidIssue(issues: ExecutionValidationIssue[], value: unknown, path: string, version7 = false) {
  if (typeof value !== "string" || !(version7 ? UUID_V7_PATTERN : UUID_PATTERN).test(value)) {
    issues.push({ path, message: version7 ? "Must be a UUIDv7." : "Must be a UUID." });
  }
}

function unsupportedKeyIssues(
  issues: ExecutionValidationIssue[],
  value: ObjectValue,
  allowedKeys: Set<string>,
  path: string,
) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      issues.push({ path: `${path}.${key}`, message: "Is not supported in this API version." });
    }
  }
}

function validateActualWeight(
  value: unknown,
  path: string,
  issues: ExecutionValidationIssue[],
): value is { amount: number; unit: string } {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return false;
  }
  unsupportedKeyIssues(issues, value, WEIGHT_KEYS, path);
  if (
    typeof value.amount !== "number" ||
    !Number.isFinite(value.amount) ||
    value.amount <= 0
  ) {
    issues.push({ path: `${path}.amount`, message: "Must be a positive number." });
  }
  if (!isNonEmptyString(value.unit) || value.unit.length > 16) {
    issues.push({
      path: `${path}.unit`,
      message: "Must be a non-empty string with at most 16 characters.",
    });
  }
  return true;
}

function validatePrescriptionMetric(value: unknown, path: string, issues: ExecutionValidationIssue[]) {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return;
  }
  unsupportedKeyIssues(issues, value, PRESCRIPTION_METRIC_KEYS, path);
  uuidIssue(issues, value.plannedPrescriptionId, `${path}.plannedPrescriptionId`);
  if (value.actualWeight !== undefined) {
    validateActualWeight(value.actualWeight, `${path}.actualWeight`, issues);
  }
  if (value.loadStatus !== undefined && !LOAD_STATUSES.has(value.loadStatus as string)) {
    issues.push({ path: `${path}.loadStatus`, message: "Must be rx or scaled." });
  }
  if (value.actualWeight === undefined && value.loadStatus === undefined) {
    issues.push({
      path,
      message: "Must include actualWeight or loadStatus.",
    });
  }
}

function validateMetrics(value: unknown, path: string, issues: ExecutionValidationIssue[]) {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return;
  }
  unsupportedKeyIssues(issues, value, METRIC_KEYS, path);
  for (const key of ["rounds", "extraRepetitions"] as const) {
    const metric = value[key];
    if (
      metric !== undefined &&
      (typeof metric !== "number" || !Number.isInteger(metric) || metric < 0)
    ) {
      issues.push({ path: `${path}.${key}`, message: "Must be a non-negative integer." });
    }
  }
  if (value.prescriptions !== undefined) {
    if (!Array.isArray(value.prescriptions)) {
      issues.push({ path: `${path}.prescriptions`, message: "Must be an array." });
      return;
    }
    const seen = new Set<string>();
    value.prescriptions.forEach((item: unknown, index: number) => {
      const itemPath = `${path}.prescriptions[${index}]`;
      validatePrescriptionMetric(item, itemPath, issues);
      if (isObject(item) && typeof item.plannedPrescriptionId === "string") {
        if (seen.has(item.plannedPrescriptionId)) {
          issues.push({
            path: `${itemPath}.plannedPrescriptionId`,
            message: "Must be unique within the block.",
          });
        }
        seen.add(item.plannedPrescriptionId);
      }
    });
  }
}

function validateBlock(value: unknown, path: string, issues: ExecutionValidationIssue[]): value is BlockExecutionSnapshot {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return false;
  }
  uuidIssue(issues, value.id, `${path}.id`, true);
  if (value.plannedBlockId !== undefined) uuidIssue(issues, value.plannedBlockId, `${path}.plannedBlockId`);
  if (!Number.isInteger(value.position) || Number(value.position) <= 0) {
    issues.push({ path: `${path}.position`, message: "Must be a positive integer." });
  }
  uuidIssue(issues, value.blockTypeId, `${path}.blockTypeId`);
  if (!isNonEmptyString(value.title)) issues.push({ path: `${path}.title`, message: "Must be a non-empty string." });
  if (typeof value.status !== "string" || !BLOCK_STATUSES.has(value.status as BlockExecutionStatus)) {
    issues.push({ path: `${path}.status`, message: "Must be a supported block status." });
  }
  if (value.withoutMetrics !== undefined && typeof value.withoutMetrics !== "boolean") {
    issues.push({ path: `${path}.withoutMetrics`, message: "Must be a boolean." });
  }
  optionalStringIssue(issues, value.notes, `${path}.notes`);
  if (value.metrics !== undefined) validateMetrics(value.metrics, `${path}.metrics`, issues);
  for (const unsupported of ["attempts", "feelings", "substitutions"]) {
    if (value[unsupported] !== undefined) {
      issues.push({ path: `${path}.${unsupported}`, message: "Is not supported in this API version." });
    }
  }
  return true;
}

export function isUuidV7(value: unknown): value is string {
  return typeof value === "string" && UUID_V7_PATTERN.test(value);
}

export function validateSessionExecutionSnapshot(value: unknown):
  | { valid: true; snapshot: SessionExecutionSnapshot }
  | { valid: false; issues: ExecutionValidationIssue[] } {
  if (!isObject(value)) return { valid: false, issues: [{ path: "$", message: "Must be an object." }] };
  const issues: ExecutionValidationIssue[] = [];
  if (!Number.isInteger(value.baseRevision) || Number(value.baseRevision) < 0) {
    issues.push({ path: "baseRevision", message: "Must be a non-negative integer." });
  }
  if (value.plannedSessionId !== undefined) uuidIssue(issues, value.plannedSessionId, "plannedSessionId");
  if (!isIsoDate(value.executionDate)) {
    issues.push({ path: "executionDate", message: "Must be a valid ISO date." });
  }
  if (typeof value.status !== "string" || !SESSION_STATUSES.has(value.status as SessionExecutionStatus)) {
    issues.push({ path: "status", message: "Must be a supported execution status." });
  }
  optionalStringIssue(issues, value.generalNote, "generalNote");
  if (!Array.isArray(value.blocks) || value.blocks.length === 0) {
    issues.push({ path: "blocks", message: "Must contain at least one block." });
  } else {
    value.blocks.forEach((block, index) => validateBlock(block, `blocks[${index}]`, issues));
  }
  const ids = new Set<string>();
  const positions = new Set<number>();
  if (Array.isArray(value.blocks)) {
    value.blocks.forEach((block, index) => {
      if (!isObject(block)) return;
      if (typeof block.id === "string") {
        if (ids.has(block.id)) issues.push({ path: `blocks[${index}].id`, message: "Must be unique." });
        ids.add(block.id);
      }
      if (typeof block.position === "number") {
        if (positions.has(block.position)) {
          issues.push({ path: `blocks[${index}].position`, message: "Must be unique within the execution." });
        }
        positions.add(block.position);
      }
      if (block.plannedBlockId && !value.plannedSessionId) {
        issues.push({ path: `blocks[${index}].plannedBlockId`, message: "Requires plannedSessionId." });
      }
    });
  }
  const snapshot = value as SessionExecutionSnapshot;
  return issues.length > 0 ? { valid: false, issues } : { valid: true, snapshot };
}
