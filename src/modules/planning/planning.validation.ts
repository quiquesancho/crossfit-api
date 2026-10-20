import type {
  PlanningBlock,
  PlanningPrescription,
  PlanningPublication,
  PlanningSession,
  PlanningWeek,
  ValidationIssue,
} from "./planning.types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type ObjectValue = Record<string, unknown>;

function isObject(value: unknown): value is ObjectValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isRpe(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 10;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3])
  );
}

export function isIsoWeekStart(value: unknown): value is string {
  return isIsoDate(value) && new Date(`${value}T00:00:00Z`).getUTCDay() === 1;
}

function addStringIssue(issues: ValidationIssue[], value: unknown, path: string, required = false) {
  if ((required && !isNonEmptyString(value)) || (!required && !isOptionalString(value))) {
    issues.push({ path, message: required ? "Must be a non-empty string." : "Must be a string." });
  }
}

function addPositiveIntegerIssue(issues: ValidationIssue[], value: unknown, path: string) {
  if (value !== undefined && !isPositiveInteger(value)) {
    issues.push({ path, message: "Must be a positive integer." });
  }
}

function addRpeIssue(issues: ValidationIssue[], value: unknown, path: string) {
  if (value !== undefined && !isRpe(value)) {
    issues.push({ path, message: "Must be an integer between 1 and 10." });
  }
}

function validatePrescription(value: unknown, path: string, issues: ValidationIssue[]): value is PlanningPrescription {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return false;
  }

  if (value.movementId !== undefined && (typeof value.movementId !== "string" || !UUID_PATTERN.test(value.movementId))) {
    issues.push({ path: `${path}.movementId`, message: "Must be a UUID." });
  }
  if (
    value.complexVersionId !== undefined &&
    (typeof value.complexVersionId !== "string" || !UUID_PATTERN.test(value.complexVersionId))
  ) {
    issues.push({ path: `${path}.complexVersionId`, message: "Must be a UUID." });
  }
  if (value.movementId !== undefined && value.complexVersionId !== undefined) {
    issues.push({ path, message: "Cannot reference both a movement and a complex version." });
  }
  if (value.details !== undefined && !isObject(value.details)) {
    issues.push({ path: `${path}.details`, message: "Must be an object." });
  }
  addStringIssue(issues, value.notes, `${path}.notes`);
  return true;
}

function validateBlock(value: unknown, path: string, issues: ValidationIssue[]): value is PlanningBlock {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return false;
  }

  if (typeof value.blockTypeId !== "string" || !UUID_PATTERN.test(value.blockTypeId)) {
    issues.push({ path: `${path}.blockTypeId`, message: "Must be a UUID." });
  }
  addStringIssue(issues, value.title, `${path}.title`, true);
  addStringIssue(issues, value.instructions, `${path}.instructions`);
  addPositiveIntegerIssue(issues, value.durationSeconds, `${path}.durationSeconds`);
  addRpeIssue(issues, value.targetRpe, `${path}.targetRpe`);

  if (value.prescriptions !== undefined) {
    if (!Array.isArray(value.prescriptions)) {
      issues.push({ path: `${path}.prescriptions`, message: "Must be an array." });
    } else {
      value.prescriptions.forEach((item, index) => validatePrescription(item, `${path}.prescriptions[${index}]`, issues));
    }
  }
  return true;
}

function validateSession(value: unknown, path: string, issues: ValidationIssue[]): value is PlanningSession {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return false;
  }

  addStringIssue(issues, value.externalId, `${path}.externalId`, true);
  if (!isIsoDate(value.plannedDate)) {
    issues.push({ path: `${path}.plannedDate`, message: "Must be a valid ISO date." });
  }
  addStringIssue(issues, value.title, `${path}.title`, true);
  addStringIssue(issues, value.objective, `${path}.objective`);
  addPositiveIntegerIssue(issues, value.durationSeconds, `${path}.durationSeconds`);
  addRpeIssue(issues, value.targetRpe, `${path}.targetRpe`);

  if (!Array.isArray(value.blocks) || value.blocks.length === 0) {
    issues.push({ path: `${path}.blocks`, message: "Must contain at least one block." });
  } else {
    value.blocks.forEach((item, index) => validateBlock(item, `${path}.blocks[${index}]`, issues));
  }
  return true;
}

function validateWeek(value: unknown, path: string, issues: ValidationIssue[]): value is PlanningWeek {
  if (!isObject(value)) {
    issues.push({ path, message: "Must be an object." });
    return false;
  }

  if (!isIsoWeekStart(value.weekStart)) {
    issues.push({ path: `${path}.weekStart`, message: "Must be a valid ISO date for a Monday." });
  }
  addStringIssue(issues, value.title, `${path}.title`);
  addStringIssue(issues, value.priorities, `${path}.priorities`);

  if (!Array.isArray(value.sessions)) {
    issues.push({ path: `${path}.sessions`, message: "Must be an array." });
  } else {
    value.sessions.forEach((item, index) => validateSession(item, `${path}.sessions[${index}]`, issues));
  }
  return true;
}

export function validatePlanningPublication(value: unknown):
  | { valid: true; publication: PlanningPublication }
  | { valid: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) return { valid: false, issues: [{ path: "$", message: "Must be an object." }] };

  addStringIssue(issues, value.sourceVersion, "sourceVersion", true);
  addStringIssue(issues, value.title, "title", true);
  if (!Array.isArray(value.weeks) || value.weeks.length === 0) {
    issues.push({ path: "weeks", message: "Must contain at least one week." });
  } else {
    value.weeks.forEach((item, index) => validateWeek(item, `weeks[${index}]`, issues));
  }

  if (issues.length > 0) return { valid: false, issues };

  const publication = value as PlanningPublication;
  const weekStarts = new Set<string>();
  const sessionIds = new Set<string>();
  publication.weeks.forEach((week, weekIndex) => {
    if (weekStarts.has(week.weekStart)) {
      issues.push({ path: `weeks[${weekIndex}].weekStart`, message: "Must be unique within the publication." });
    }
    weekStarts.add(week.weekStart);
    week.sessions.forEach((session, sessionIndex) => {
      if (sessionIds.has(session.externalId)) {
        issues.push({
          path: `weeks[${weekIndex}].sessions[${sessionIndex}].externalId`,
          message: "Must be unique within the publication.",
        });
      }
      sessionIds.add(session.externalId);
    });
  });

  return issues.length > 0 ? { valid: false, issues } : { valid: true, publication };
}
