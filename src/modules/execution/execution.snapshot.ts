import type {
  BlockExecutionMetrics,
  BlockExecutionSnapshot,
  FeelingSnapshot,
  PrescriptionExecutionMetric,
  SessionExecutionSnapshot,
  SetAttemptSnapshot,
  SubstitutionSnapshot,
} from "./execution.types.js";

const RECORDED_STATUSES = new Set<BlockExecutionSnapshot["status"]>([
  "completed",
  "completed_without_metric",
  "partial",
]);

function cleanFeeling(feeling: FeelingSnapshot | undefined): FeelingSnapshot | undefined {
  if (!feeling) return undefined;
  const cleaned: FeelingSnapshot = { id: feeling.id };
  if (feeling.rpe !== undefined) cleaned.rpe = feeling.rpe;
  if (feeling.pain !== undefined) cleaned.pain = feeling.pain;
  if (feeling.recoveryId !== undefined) cleaned.recoveryId = feeling.recoveryId;
  if (feeling.techniqueQualityId !== undefined) {
    cleaned.techniqueQualityId = feeling.techniqueQualityId;
  }
  if (feeling.limitationId !== undefined) cleaned.limitationId = feeling.limitationId;
  if (feeling.note !== undefined) cleaned.note = feeling.note;
  return cleaned;
}

function cleanSubstitutions(
  substitutions: SubstitutionSnapshot[] | undefined,
): SubstitutionSnapshot[] | undefined {
  if (!substitutions || substitutions.length === 0) return undefined;
  return substitutions
    .map((substitution) => ({
      id: substitution.id,
      plannedPrescriptionId: substitution.plannedPrescriptionId,
      actualMovementId: substitution.actualMovementId,
      ...(substitution.reasonId !== undefined ? { reasonId: substitution.reasonId } : {}),
      ...(substitution.note !== undefined ? { note: substitution.note } : {}),
    }))
    .sort((left, right) => left.plannedPrescriptionId.localeCompare(right.plannedPrescriptionId));
}

function cleanAttempt(attempt: SetAttemptSnapshot): SetAttemptSnapshot {
  const cleaned: SetAttemptSnapshot = {
    id: attempt.id,
    position: attempt.position,
    status: attempt.status,
  };
  if (attempt.plannedPrescriptionId !== undefined) {
    cleaned.plannedPrescriptionId = attempt.plannedPrescriptionId;
  }
  if (attempt.movementId !== undefined) cleaned.movementId = attempt.movementId;
  if (attempt.complexVersionId !== undefined) cleaned.complexVersionId = attempt.complexVersionId;
  if (attempt.note !== undefined) cleaned.note = attempt.note;
  if (attempt.weight !== undefined) cleaned.weight = { ...attempt.weight };
  if (attempt.repetitions !== undefined) cleaned.repetitions = attempt.repetitions;
  return cleaned;
}

function cleanAttempts(attempts: SetAttemptSnapshot[] | undefined): SetAttemptSnapshot[] | undefined {
  if (!attempts || attempts.length === 0) return undefined;
  return attempts
    .map(cleanAttempt)
    .sort((left, right) => left.position - right.position);
}

function cleanPrescriptionMetric(item: PrescriptionExecutionMetric): PrescriptionExecutionMetric {
  const prescription: PrescriptionExecutionMetric = {
    plannedPrescriptionId: item.plannedPrescriptionId,
  };
  if (item.actualWeight !== undefined) prescription.actualWeight = { ...item.actualWeight };
  if (item.loadStatus !== undefined) prescription.loadStatus = item.loadStatus;
  return prescription;
}

export function cleanBlockMetrics(
  metrics: BlockExecutionMetrics | undefined,
): BlockExecutionMetrics | undefined {
  if (!metrics) return undefined;
  const cleaned: BlockExecutionMetrics = {};
  if (metrics.rounds !== undefined) cleaned.rounds = metrics.rounds;
  if (metrics.extraRepetitions !== undefined) {
    cleaned.extraRepetitions = metrics.extraRepetitions;
  }
  if (metrics.prescriptions && metrics.prescriptions.length > 0) {
    cleaned.prescriptions = metrics.prescriptions.map(cleanPrescriptionMetric);
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function blockWithoutMetrics(block: BlockExecutionSnapshot): boolean {
  return (
    RECORDED_STATUSES.has(block.status) &&
    (block.status === "completed_without_metric" || block.withoutMetrics === true)
  );
}

export function normalizedBlockContent(block: BlockExecutionSnapshot): BlockExecutionSnapshot {
  const withoutMetrics = blockWithoutMetrics(block);
  const recorded = RECORDED_STATUSES.has(block.status);
  const metrics = recorded && !withoutMetrics ? cleanBlockMetrics(block.metrics) : undefined;
  const attempts = recorded && !withoutMetrics ? cleanAttempts(block.attempts) : undefined;
  const normalized: BlockExecutionSnapshot = {
    id: block.id,
    plannedBlockId: block.plannedBlockId,
    position: block.position,
    blockTypeId: block.blockTypeId,
    title: block.title,
    status: block.status,
    withoutMetrics,
    notes: block.notes,
  };
  const feeling = cleanFeeling(block.feeling);
  const substitutions = cleanSubstitutions(block.substitutions);
  if (metrics) normalized.metrics = metrics;
  if (attempts) normalized.attempts = attempts;
  if (feeling) normalized.feeling = feeling;
  if (substitutions) normalized.substitutions = substitutions;
  return normalized;
}

export function normalizedSnapshot(snapshot: SessionExecutionSnapshot): SessionExecutionSnapshot {
  const normalized: SessionExecutionSnapshot = {
    ...snapshot,
    blocks: snapshot.blocks.map(normalizedBlockContent),
  };
  const feeling = cleanFeeling(snapshot.feeling);
  if (feeling) normalized.feeling = feeling;
  else delete normalized.feeling;
  return normalized;
}
