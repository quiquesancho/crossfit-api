import type {
  BlockExecutionSnapshot,
  BlockExecutionStatus,
  ExecutionValidationIssue,
  FeelingSnapshot,
  SessionExecutionSnapshot,
  SessionExecutionStatus,
  SetAttemptSnapshot,
  SubstitutionSnapshot,
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
const ATTEMPT_STATUSES = new Set(["completed", "partial", "failed", "skipped"]);
const METRIC_KEYS = new Set(["rounds", "extraRepetitions", "prescriptions"]);
const PRESCRIPTION_METRIC_KEYS = new Set([
  "plannedPrescriptionId",
  "actualWeight",
  "loadStatus",
]);
const ATTEMPT_KEYS = new Set([
  "id",
  "plannedPrescriptionId",
  "position",
  "movementId",
  "complexVersionId",
  "status",
  "note",
  "weight",
  "repetitions",
  "durationSeconds",
]);
const WEIGHT_KEYS = new Set(["amount", "unit"]);
const FEELING_KEYS = new Set([
  "id",
  "rpe",
  "pain",
  "recoveryId",
  "techniqueQualityId",
  "limitationId",
  "note",
]);
const SUBSTITUTION_KEYS = new Set([
  "id",
  "plannedPrescriptionId",
  "actualMovementId",
  "reasonId",
  "note",
]);

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

function validateFeeling(
  value: unknown,
  path: string,
  issues: ExecutionValidationIssue[],
): value is FeelingSnapshot {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return false;
  }
  unsupportedKeyIssues(issues, value, FEELING_KEYS, path);
  uuidIssue(issues, value.id, `${path}.id`, true);
  if (
    value.rpe !== undefined &&
    (typeof value.rpe !== "number" || !Number.isInteger(value.rpe) || value.rpe < 1 || value.rpe > 10)
  ) {
    issues.push({ path: `${path}.rpe`, message: "Must be an integer between 1 and 10." });
  }
  if (
    value.pain !== undefined &&
    (typeof value.pain !== "number" ||
      !Number.isInteger(value.pain) ||
      value.pain < 0 ||
      value.pain > 10)
  ) {
    issues.push({ path: `${path}.pain`, message: "Must be an integer between 0 and 10." });
  }
  for (const key of ["recoveryId", "techniqueQualityId", "limitationId"] as const) {
    if (value[key] !== undefined) uuidIssue(issues, value[key], `${path}.${key}`);
  }
  optionalStringIssue(issues, value.note, `${path}.note`);
  const hasContent =
    value.rpe !== undefined ||
    value.pain !== undefined ||
    value.recoveryId !== undefined ||
    value.techniqueQualityId !== undefined ||
    value.limitationId !== undefined ||
    isNonEmptyString(value.note);
  if (!hasContent) {
    issues.push({ path, message: "Must include at least one feeling value." });
  }
  return true;
}

function validateSubstitution(
  value: unknown,
  path: string,
  issues: ExecutionValidationIssue[],
): value is SubstitutionSnapshot {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return false;
  }
  unsupportedKeyIssues(issues, value, SUBSTITUTION_KEYS, path);
  uuidIssue(issues, value.id, `${path}.id`, true);
  uuidIssue(issues, value.plannedPrescriptionId, `${path}.plannedPrescriptionId`);
  uuidIssue(issues, value.actualMovementId, `${path}.actualMovementId`);
  if (value.reasonId !== undefined) uuidIssue(issues, value.reasonId, `${path}.reasonId`);
  optionalStringIssue(issues, value.note, `${path}.note`);
  return true;
}

function validateSubstitutions(
  value: unknown,
  path: string,
  issues: ExecutionValidationIssue[],
) {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Must be an array." });
    return;
  }
  const ids = new Set<string>();
  const prescriptions = new Set<string>();
  value.forEach((item: unknown, index: number) => {
    const itemPath = `${path}[${index}]`;
    validateSubstitution(item, itemPath, issues);
    if (!isObject(item)) return;
    if (typeof item.id === "string") {
      if (ids.has(item.id)) issues.push({ path: `${itemPath}.id`, message: "Must be unique." });
      ids.add(item.id);
    }
    if (typeof item.plannedPrescriptionId === "string") {
      if (prescriptions.has(item.plannedPrescriptionId)) {
        issues.push({
          path: `${itemPath}.plannedPrescriptionId`,
          message: "Must be unique within the block.",
        });
      }
      prescriptions.add(item.plannedPrescriptionId);
    }
  });
}

function validateAttempt(
  value: unknown,
  path: string,
  issues: ExecutionValidationIssue[],
): value is SetAttemptSnapshot {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return false;
  }
  unsupportedKeyIssues(issues, value, ATTEMPT_KEYS, path);
  uuidIssue(issues, value.id, `${path}.id`, true);
  if (!Number.isInteger(value.position) || Number(value.position) <= 0) {
    issues.push({ path: `${path}.position`, message: "Must be a positive integer." });
  }
  if (typeof value.status !== "string" || !ATTEMPT_STATUSES.has(value.status)) {
    issues.push({ path: `${path}.status`, message: "Must be a supported attempt status." });
  }
  if (value.plannedPrescriptionId !== undefined) {
    uuidIssue(issues, value.plannedPrescriptionId, `${path}.plannedPrescriptionId`);
  }
  if (value.movementId !== undefined) uuidIssue(issues, value.movementId, `${path}.movementId`);
  if (value.complexVersionId !== undefined) {
    uuidIssue(issues, value.complexVersionId, `${path}.complexVersionId`);
  }
  const anchors = [
    value.plannedPrescriptionId,
    value.movementId,
    value.complexVersionId,
  ].filter((anchor) => anchor !== undefined).length;
  if (anchors !== 1) {
    issues.push({
      path,
      message: "Must reference exactly one of plannedPrescriptionId, movementId or complexVersionId.",
    });
  }
  optionalStringIssue(issues, value.note, `${path}.note`);
  if (value.weight !== undefined) {
    validateActualWeight(value.weight, `${path}.weight`, issues);
  }
  if (
    value.repetitions !== undefined &&
    (typeof value.repetitions !== "number" ||
      !Number.isInteger(value.repetitions) ||
      value.repetitions < 0)
  ) {
    issues.push({ path: `${path}.repetitions`, message: "Must be a non-negative integer." });
  }
  if (
    value.durationSeconds !== undefined &&
    (typeof value.durationSeconds !== "number" ||
      !Number.isFinite(value.durationSeconds) ||
      value.durationSeconds <= 0 ||
      value.durationSeconds > 86_400)
  ) {
    issues.push({
      path: `${path}.durationSeconds`,
      message: "Must be a positive number of seconds, at most 86400.",
    });
  }
  return true;
}

function validateAttempts(value: unknown, path: string, issues: ExecutionValidationIssue[]) {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Must be an array." });
    return;
  }
  const ids = new Set<string>();
  const positions = new Set<number>();
  value.forEach((item: unknown, index: number) => {
    const itemPath = `${path}[${index}]`;
    validateAttempt(item, itemPath, issues);
    if (!isObject(item)) return;
    if (typeof item.id === "string") {
      if (ids.has(item.id)) issues.push({ path: `${itemPath}.id`, message: "Must be unique." });
      ids.add(item.id);
    }
    if (typeof item.position === "number") {
      if (positions.has(item.position)) {
        issues.push({ path: `${itemPath}.position`, message: "Must be unique within the block." });
      }
      positions.add(item.position);
    }
  });
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
  if (value.attempts !== undefined) validateAttempts(value.attempts, `${path}.attempts`, issues);
  if (value.feeling !== undefined) validateFeeling(value.feeling, `${path}.feeling`, issues);
  if (value.substitutions !== undefined) {
    validateSubstitutions(value.substitutions, `${path}.substitutions`, issues);
  }
  for (const unsupported of ["feelings", "setAttempts"]) {
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
  if (value.feeling !== undefined) validateFeeling(value.feeling, "feeling", issues);
  if (!Array.isArray(value.blocks) || value.blocks.length === 0) {
    issues.push({ path: "blocks", message: "Must contain at least one block." });
  } else {
    value.blocks.forEach((block, index) => validateBlock(block, `blocks[${index}]`, issues));
  }
  const ids = new Set<string>();
  const attemptIds = new Set<string>();
  const positions = new Set<number>();
  if (Array.isArray(value.blocks)) {
    value.blocks.forEach((block, index) => {
      if (!isObject(block)) return;
      if (typeof block.id === "string") {
        if (ids.has(block.id)) issues.push({ path: `blocks[${index}].id`, message: "Must be unique." });
        ids.add(block.id);
      }
      if (Array.isArray(block.attempts)) {
        block.attempts.forEach((attempt: unknown, attemptIndex: number) => {
          if (!isObject(attempt) || typeof attempt.id !== "string") return;
          if (attemptIds.has(attempt.id)) {
            issues.push({
              path: `blocks[${index}].attempts[${attemptIndex}].id`,
              message: "Must be unique within the execution.",
            });
          }
          attemptIds.add(attempt.id);
        });
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
