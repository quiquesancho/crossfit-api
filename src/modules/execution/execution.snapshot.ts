import type {
  BlockExecutionMetrics,
  BlockExecutionSnapshot,
  PrescriptionExecutionMetric,
  SessionExecutionSnapshot,
} from "./execution.types.js";

const RECORDED_STATUSES = new Set<BlockExecutionSnapshot["status"]>([
  "completed",
  "completed_without_metric",
  "partial",
]);

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
  const metrics =
    RECORDED_STATUSES.has(block.status) && !withoutMetrics
      ? cleanBlockMetrics(block.metrics)
      : undefined;
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
  if (metrics) normalized.metrics = metrics;
  return normalized;
}

export function normalizedSnapshot(snapshot: SessionExecutionSnapshot): SessionExecutionSnapshot {
  return {
    ...snapshot,
    blocks: snapshot.blocks.map(normalizedBlockContent),
  };
}
