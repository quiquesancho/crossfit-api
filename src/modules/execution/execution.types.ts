export type SessionExecutionStatus = "draft" | "completed" | "annulled";
export type BlockExecutionStatus =
  | "draft"
  | "completed"
  | "completed_without_metric"
  | "partial"
  | "skipped"
  | "abandoned";

export type WeightValue = {
  amount: number;
  unit: string;
};

export type LoadStatus = "rx" | "scaled";

export type SetAttemptStatus = "completed" | "partial" | "failed" | "skipped";

export type SetAttemptSnapshot = {
  id: string;
  plannedPrescriptionId?: string;
  position: number;
  movementId?: string;
  complexVersionId?: string;
  status: SetAttemptStatus;
  note?: string;
  weight?: WeightValue;
  repetitions?: number;
};

export type PrescriptionExecutionMetric = {
  plannedPrescriptionId: string;
  actualWeight?: WeightValue;
  loadStatus?: LoadStatus;
};

export type BlockExecutionMetrics = {
  rounds?: number;
  extraRepetitions?: number;
  prescriptions?: PrescriptionExecutionMetric[];
};

export type FeelingSnapshot = {
  id: string;
  rpe?: number;
  pain?: number;
  recoveryId?: string;
  techniqueQualityId?: string;
  limitationId?: string;
  note?: string;
};

export type SubstitutionSnapshot = {
  id: string;
  plannedPrescriptionId: string;
  actualMovementId: string;
  reasonId?: string;
  note?: string;
};

export type BlockExecutionSnapshot = {
  id: string;
  plannedBlockId?: string;
  position: number;
  blockTypeId: string;
  title: string;
  status: BlockExecutionStatus;
  withoutMetrics?: boolean;
  notes?: string;
  metrics?: BlockExecutionMetrics;
  feeling?: FeelingSnapshot;
  substitutions?: SubstitutionSnapshot[];
  attempts?: SetAttemptSnapshot[];
};

export type SessionExecutionSnapshot = {
  baseRevision: number;
  plannedSessionId?: string;
  executionDate: string;
  status: SessionExecutionStatus;
  generalNote?: string;
  feeling?: FeelingSnapshot;
  blocks: BlockExecutionSnapshot[];
};

export type SessionExecutionResult = {
  id: string;
  revision: number;
  status: SessionExecutionStatus;
  updatedAt: string;
  result: "persisted" | "unchanged";
};

export type SessionExecutionWriter = {
  synchronize(executionId: string, snapshot: SessionExecutionSnapshot): Promise<SessionExecutionResult>;
};

export type ExecutionValidationIssue = { path: string; message: string };

export class ExecutionRevisionConflictError extends Error {}

export class ExecutionLocalAthleteNotFoundError extends Error {}

export class ExecutionValidationError extends Error {
  constructor(public readonly issues: ExecutionValidationIssue[]) {
    super("Execution validation failed.");
  }
}
