export type PlanningPrescription = {
  movementId?: string;
  complexVersionId?: string;
  details?: Record<string, unknown>;
  notes?: string;
};

export type PlanningBlock = {
  blockTypeId: string;
  title: string;
  instructions?: string;
  durationSeconds?: number;
  targetRpe?: number;
  prescriptions?: PlanningPrescription[];
};

export type PlanningSession = {
  externalId: string;
  plannedDate: string;
  title: string;
  objective?: string;
  durationSeconds?: number;
  targetRpe?: number;
  blocks: PlanningBlock[];
};

export type PlanningWeek = {
  weekStart: string;
  title?: string;
  priorities?: string;
  sessions: PlanningSession[];
};

export type PlanningPublication = {
  sourceVersion: string;
  title: string;
  weeks: PlanningWeek[];
};

export type PublicationResult = {
  trainingPlanId: string;
  planVersionId: string;
  status: "published" | "unchanged";
};

export type ValidationIssue = {
  path: string;
  message: string;
};

export type PlanningPublisher = {
  publish(externalPlanId: string, publication: PlanningPublication): Promise<PublicationResult>;
};

export class PlanningValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super("Planning publication is invalid.");
  }
}

export class PlanningVersionConflictError extends Error {
  constructor() {
    super("The source version already exists with different content.");
  }
}

export class LocalAthleteNotFoundError extends Error {
  constructor() {
    super("The local athlete profile is unavailable.");
  }
}
