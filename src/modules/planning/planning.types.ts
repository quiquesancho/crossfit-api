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

export type PlanningWeekView = {
  id: string;
  trainingPlanId: string;
  planVersionId: string;
  planTitle: string;
  weekStart: string;
  title: string | null;
  priorities: string | null;
  sessions: Array<{
    id: string;
    externalId: string | null;
    plannedDate: string;
    title: string;
    objective: string | null;
    durationSeconds: number | null;
    targetRpe: number | null;
    blocks: Array<{
      id: string;
      position: number;
      blockType: { id: string; code: string; description: string };
      title: string;
      instructions: string | null;
      durationSeconds: number | null;
      targetRpe: number | null;
      prescriptions: Array<{
        id: string;
        position: number;
        movement: { id: string; code: string; name: string } | null;
        complex: { id: string; code: string; name: string; versionNumber: number } | null;
        details: Record<string, unknown>;
        notes: string | null;
      }>;
    }>;
  }>;
};

export type PlanningWeekReader = {
  getWeek(weekStart: string): Promise<PlanningWeekView | null>;
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
