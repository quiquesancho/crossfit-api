import type { ValidationIssue } from "../planning/planning.types.js";
import type {
  MovementCatalogFamilyInput,
  MovementCatalogImport,
  MovementCatalogMovementInput,
} from "./movement-catalog.types.js";

const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CODE_LENGTH = 80;
const MAX_NAME_LENGTH = 200;
const MAX_FAMILIES = 500;
const MAX_MOVEMENTS = 1000;

type ObjectValue = Record<string, unknown>;

function isObject(value: unknown): value is ObjectValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addUnexpectedKeys(issues: ValidationIssue[], value: ObjectValue, allowed: string[], path: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      issues.push({ path: `${path}.${key}`, message: "Unknown field." });
    }
  }
}

function normalizeCode(value: unknown, path: string, issues: ValidationIssue[]): string | undefined {
  if (typeof value !== "string") {
    issues.push({ path, message: "Must be a string." });
    return undefined;
  }
  const code = value.trim();
  if (code.length === 0) {
    issues.push({ path, message: "Must be a non-empty string." });
    return undefined;
  }
  if (code.length > MAX_CODE_LENGTH) {
    issues.push({ path, message: `Must be at most ${MAX_CODE_LENGTH} characters.` });
    return undefined;
  }
  if (!CODE_PATTERN.test(code)) {
    issues.push({ path, message: "Must use lowercase letters, numbers and single hyphens." });
    return undefined;
  }
  return code;
}

function normalizeName(value: unknown, path: string, issues: ValidationIssue[]): string | undefined {
  if (typeof value !== "string") {
    issues.push({ path, message: "Must be a string." });
    return undefined;
  }
  const name = value.trim();
  if (name.length === 0) {
    issues.push({ path, message: "Must be a non-empty string." });
    return undefined;
  }
  if (name.length > MAX_NAME_LENGTH) {
    issues.push({ path, message: `Must be at most ${MAX_NAME_LENGTH} characters.` });
    return undefined;
  }
  return name;
}

function validateFamilies(value: unknown, issues: ValidationIssue[]): MovementCatalogFamilyInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ path: "families", message: "Must be an array." });
    return [];
  }
  if (value.length > MAX_FAMILIES) {
    issues.push({ path: "families", message: `Must contain at most ${MAX_FAMILIES} entries.` });
    return [];
  }

  const families: MovementCatalogFamilyInput[] = [];
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const path = `families[${index}]`;
    if (!isObject(item)) {
      issues.push({ path, message: "Must be an object." });
      return;
    }
    addUnexpectedKeys(issues, item, ["code", "name"], path);
    const code = normalizeCode(item.code, `${path}.code`, issues);
    const name = normalizeName(item.name, `${path}.name`, issues);
    if (code) {
      if (seen.has(code)) {
        issues.push({ path: `${path}.code`, message: "Must be unique within the import." });
      }
      seen.add(code);
    }
    if (code && name) families.push({ code, name });
  });
  return families;
}

function validateMovements(value: unknown, issues: ValidationIssue[]): MovementCatalogMovementInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ path: "movements", message: "Must be an array." });
    return [];
  }
  if (value.length > MAX_MOVEMENTS) {
    issues.push({ path: "movements", message: `Must contain at most ${MAX_MOVEMENTS} entries.` });
    return [];
  }

  const movements: MovementCatalogMovementInput[] = [];
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const path = `movements[${index}]`;
    if (!isObject(item)) {
      issues.push({ path, message: "Must be an object." });
      return;
    }
    addUnexpectedKeys(issues, item, ["code", "name", "familyCode"], path);
    const code = normalizeCode(item.code, `${path}.code`, issues);
    const name = normalizeName(item.name, `${path}.name`, issues);
    const familyCode = normalizeCode(item.familyCode, `${path}.familyCode`, issues);
    if (code) {
      if (seen.has(code)) {
        issues.push({ path: `${path}.code`, message: "Must be unique within the import." });
      }
      seen.add(code);
    }
    if (code && name && familyCode) movements.push({ code, name, familyCode });
  });
  return movements;
}

export function validateMovementCatalogImport(
  value: unknown,
): { valid: true; input: MovementCatalogImport } | { valid: false; issues: ValidationIssue[] } {
  if (!isObject(value)) {
    return { valid: false, issues: [{ path: "body", message: "Must be an object." }] };
  }

  const issues: ValidationIssue[] = [];
  addUnexpectedKeys(issues, value, ["families", "movements"], "body");
  const families = validateFamilies(value.families, issues);
  const movements = validateMovements(value.movements, issues);

  const hasFamilyInput = Array.isArray(value.families) && value.families.length > 0;
  const hasMovementInput = Array.isArray(value.movements) && value.movements.length > 0;
  if (!hasFamilyInput && !hasMovementInput) {
    issues.push({ path: "body", message: "Provide at least one family or movement." });
  }

  return issues.length > 0 ? { valid: false, issues } : { valid: true, input: { families, movements } };
}
