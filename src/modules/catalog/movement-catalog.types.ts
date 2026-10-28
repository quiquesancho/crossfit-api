import type { ValidationIssue } from "../planning/planning.types.js";

export type MovementCatalogFamilyInput = {
  code: string;
  name: string;
};

export type MovementCatalogMovementInput = {
  code: string;
  name: string;
  familyCode: string;
};

export type MovementCatalogImport = {
  families: MovementCatalogFamilyInput[];
  movements: MovementCatalogMovementInput[];
};

export type MovementCatalogImportCounts = {
  created: number;
  updated: number;
  unchanged: number;
};

export type MovementCatalogImportResult = {
  status: "applied";
  families: MovementCatalogImportCounts;
  movements: MovementCatalogImportCounts;
};

export type MovementCatalogWriter = {
  importCatalog(input: MovementCatalogImport): Promise<MovementCatalogImportResult>;
};

export type MovementCatalogConflictCode =
  | "family_archived"
  | "movement_archived"
  | "movement_family_conflict";

export class MovementCatalogValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super("Movement catalog import is invalid.");
  }
}

export class MovementCatalogConflictError extends Error {
  constructor(
    readonly code: MovementCatalogConflictCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}
