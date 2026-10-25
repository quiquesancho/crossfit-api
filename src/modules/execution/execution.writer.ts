import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import {
  athlete,
  blockExecution,
  catalog,
  catalogEntry,
  complexVersion,
  feeling,
  movement,
  planVersion,
  plannedBlock,
  plannedSession,
  plannedWeek,
  prescription,
  sessionExecution,
  setAttempt,
  substitution,
  trainingPlan,
  typedMetric,
} from "../../db/schema.js";
import { hashSessionExecution } from "./execution.hash.js";
import { normalizedSnapshot } from "./execution.snapshot.js";
import {
  ExecutionLocalAthleteNotFoundError,
  ExecutionRevisionConflictError,
  ExecutionValidationError,
  type BlockExecutionSnapshot,
  type ExecutionValidationIssue,
  type FeelingSnapshot,
  type SessionExecutionSnapshot,
  type SessionExecutionWriter,
  type SetAttemptSnapshot,
  type SubstitutionSnapshot,
} from "./execution.types.js";

const FEELING_CATALOG_FIELDS = [
  { field: "recoveryId", catalogKey: "recovery", label: "recovery entry" },
  { field: "techniqueQualityId", catalogKey: "technique-quality", label: "technique quality entry" },
  { field: "limitationId", catalogKey: "limitation", label: "limitation entry" },
] as const;

type CatalogReference = {
  id: string;
  path: string;
  catalogKey: string;
  label: string;
};

function feelingCatalogReferences(
  value: FeelingSnapshot | undefined,
  path: string,
): CatalogReference[] {
  if (!value) return [];
  return FEELING_CATALOG_FIELDS.flatMap(({ field, catalogKey, label }) => {
    const id = value[field];
    return id === undefined ? [] : [{ id, path: `${path}.${field}`, catalogKey, label }];
  });
}

function catalogReferences(content: SessionExecutionSnapshot): CatalogReference[] {
  const references = feelingCatalogReferences(content.feeling, "feeling");
  content.blocks.forEach((block, index) => {
    references.push(...feelingCatalogReferences(block.feeling, `blocks[${index}].feeling`));
    (block.substitutions ?? []).forEach((item, substitutionIndex) => {
      if (item.reasonId !== undefined) {
        references.push({
          id: item.reasonId,
          path: `blocks[${index}].substitutions[${substitutionIndex}].reasonId`,
          catalogKey: "substitution-reason",
          label: "substitution reason",
        });
      }
    });
  });
  return references;
}

function feelingValues(value: FeelingSnapshot) {
  return {
    rpe: value.rpe ?? null,
    pain: value.pain ?? null,
    recoveryId: value.recoveryId ?? null,
    techniqueQualityId: value.techniqueQualityId ?? null,
    limitationId: value.limitationId ?? null,
    note: value.note ?? null,
  };
}

function substitutionValues(blockId: string, value: SubstitutionSnapshot) {
  return {
    id: value.id,
    blockExecutionId: blockId,
    plannedPrescriptionId: value.plannedPrescriptionId,
    actualMovementId: value.actualMovementId,
    reasonId: value.reasonId ?? null,
    note: value.note ?? null,
  };
}

function missingIssues(references: Array<{ id: string; path: string }>, foundIds: Set<string>, label: string) {
  return references
    .filter(({ id }) => !foundIds.has(id))
    .map(({ path }) => ({ path, message: `Unknown or invalid ${label}.` }));
}

function typedMetricValues(athleteId: string, block: BlockExecutionSnapshot) {
  if (!block.metrics) return [];
  const values: Array<{
    athleteId: string;
    blockExecutionId: string;
    metricType: string;
    numericValue: number;
    unit: string;
    context?: Record<string, unknown>;
  }> = [];
  if (block.metrics.rounds !== undefined) {
    values.push({
      athleteId,
      blockExecutionId: block.id,
      metricType: "rounds",
      numericValue: block.metrics.rounds,
      unit: "count",
    });
  }
  if (block.metrics.extraRepetitions !== undefined) {
    values.push({
      athleteId,
      blockExecutionId: block.id,
      metricType: "extra-repetitions",
      numericValue: block.metrics.extraRepetitions,
      unit: "count",
    });
  }
  for (const item of block.metrics.prescriptions ?? []) {
    if (item.actualWeight) {
      values.push({
        athleteId,
        blockExecutionId: block.id,
        metricType: "weight",
        numericValue: item.actualWeight.amount,
        unit: item.actualWeight.unit,
        context: {
          plannedPrescriptionId: item.plannedPrescriptionId,
          ...(item.loadStatus ? { loadStatus: item.loadStatus } : {}),
        },
      });
    } else if (item.loadStatus) {
      values.push({
        athleteId,
        blockExecutionId: block.id,
        metricType: "load-status",
        numericValue: item.loadStatus === "rx" ? 1 : 0,
        unit: "status",
        context: { plannedPrescriptionId: item.plannedPrescriptionId },
      });
    }
  }
  return values;
}

function attemptMetricValues(athleteId: string, attempt: SetAttemptSnapshot) {
  const values: Array<{
    athleteId: string;
    setAttemptId: string;
    metricType: string;
    numericValue: number;
    unit: string;
  }> = [];
  if (attempt.weight) {
    values.push({
      athleteId,
      setAttemptId: attempt.id,
      metricType: "weight",
      numericValue: attempt.weight.amount,
      unit: attempt.weight.unit,
    });
  }
  if (attempt.repetitions !== undefined) {
    values.push({
      athleteId,
      setAttemptId: attempt.id,
      metricType: "repetitions",
      numericValue: attempt.repetitions,
      unit: "count",
    });
  }
  return values;
}

export function createSessionExecutionWriter(database: Database): SessionExecutionWriter {
  return {
    async synchronize(executionId, snapshot) {
      const content = normalizedSnapshot(snapshot);
      const contentHash = hashSessionExecution(snapshot);
      return database.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`execution:${executionId}`}))`);

        const [localAthlete] = await tx
          .select({ id: athlete.id })
          .from(athlete)
          .where(and(eq(athlete.profileKey, "local"), eq(athlete.active, true)))
          .limit(1);
        if (!localAthlete) throw new ExecutionLocalAthleteNotFoundError();

        const [existing] = await tx
          .select({
            athleteId: sessionExecution.athleteId,
            revision: sessionExecution.revision,
            contentHash: sessionExecution.contentHash,
            status: sessionExecution.status,
            updatedAt: sessionExecution.updatedAt,
          })
          .from(sessionExecution)
          .where(eq(sessionExecution.id, executionId))
          .limit(1);
        if (existing?.athleteId !== undefined && existing.athleteId !== localAthlete.id) {
          throw new ExecutionRevisionConflictError();
        }
        if (existing?.contentHash === contentHash) {
          return {
            id: executionId,
            revision: existing.revision,
            status: existing.status as "draft" | "completed" | "annulled",
            updatedAt: existing.updatedAt.toISOString(),
            result: "unchanged" as const,
          };
        }
        if ((!existing && snapshot.baseRevision !== 0) || (existing && existing.revision !== snapshot.baseRevision)) {
          throw new ExecutionRevisionConflictError();
        }

        const issues: ExecutionValidationIssue[] = [];
        if (content.plannedSessionId) {
          const [ownedSession] = await tx
            .select({ id: plannedSession.id })
            .from(plannedSession)
            .innerJoin(plannedWeek, eq(plannedSession.plannedWeekId, plannedWeek.id))
            .innerJoin(planVersion, eq(plannedWeek.planVersionId, planVersion.id))
            .innerJoin(trainingPlan, eq(planVersion.trainingPlanId, trainingPlan.id))
            .where(
              and(
                eq(plannedSession.id, content.plannedSessionId),
                eq(trainingPlan.ownerAthleteId, localAthlete.id),
              ),
            )
            .limit(1);
          if (!ownedSession) {
            issues.push({ path: "plannedSessionId", message: "Unknown planned session for the local athlete." });
          }
        }

        const blockTypeReferences = content.blocks.map((block, index) => ({
          id: block.blockTypeId,
          path: `blocks[${index}].blockTypeId`,
        }));
        const blockTypeIds = [...new Set(blockTypeReferences.map(({ id }) => id))];
        const validBlockTypes = await tx
          .select({ id: catalogEntry.id })
          .from(catalogEntry)
          .innerJoin(catalog, eq(catalogEntry.catalogId, catalog.id))
          .where(
            and(
              eq(catalog.key, "block-type"),
              eq(catalogEntry.active, true),
              isNull(catalogEntry.archivedAt),
              inArray(catalogEntry.id, blockTypeIds),
            ),
          );
        issues.push(
          ...missingIssues(blockTypeReferences, new Set(validBlockTypes.map(({ id }) => id)), "block type"),
        );

        const plannedBlockReferences = content.blocks.flatMap((block, index) =>
          block.plannedBlockId ? [{ id: block.plannedBlockId, path: `blocks[${index}].plannedBlockId` }] : [],
        );
        if (plannedBlockReferences.length > 0 && content.plannedSessionId) {
          const validPlannedBlocks = await tx
            .select({ id: plannedBlock.id })
            .from(plannedBlock)
            .where(
              and(
                eq(plannedBlock.plannedSessionId, content.plannedSessionId),
                inArray(plannedBlock.id, [...new Set(plannedBlockReferences.map(({ id }) => id))]),
              ),
            );
          issues.push(
            ...missingIssues(
              plannedBlockReferences,
              new Set(validPlannedBlocks.map(({ id }) => id)),
              "planned block for the selected session",
            ),
          );
        }

        const prescriptionReferences = content.blocks.flatMap((block, blockIndex) => [
          ...(block.metrics?.prescriptions ?? []).map((item, prescriptionIndex) => ({
            id: item.plannedPrescriptionId,
            path: `blocks[${blockIndex}].metrics.prescriptions[${prescriptionIndex}].plannedPrescriptionId`,
            plannedBlockId: block.plannedBlockId,
          })),
          ...(block.substitutions ?? []).map((item, substitutionIndex) => ({
            id: item.plannedPrescriptionId,
            path: `blocks[${blockIndex}].substitutions[${substitutionIndex}].plannedPrescriptionId`,
            plannedBlockId: block.plannedBlockId,
          })),
          ...(block.attempts ?? []).flatMap((item, attemptIndex) =>
            item.plannedPrescriptionId
              ? [
                  {
                    id: item.plannedPrescriptionId,
                    path: `blocks[${blockIndex}].attempts[${attemptIndex}].plannedPrescriptionId`,
                    plannedBlockId: block.plannedBlockId,
                  },
                ]
              : [],
          ),
        ]);
        const plannedPrescriptionDetails = new Map<
          string,
          { movementId: string | null; complexVersionId: string | null }
        >();
        const checkablePrescriptions = new Set<string>();
        for (const reference of prescriptionReferences) {
          if (!reference.plannedBlockId) {
            issues.push({ path: reference.path, message: "Requires plannedBlockId." });
          } else if (!content.plannedSessionId) {
            issues.push({ path: reference.path, message: "Requires plannedSessionId." });
          } else {
            checkablePrescriptions.add(reference.id);
          }
        }
        if (checkablePrescriptions.size > 0 && content.plannedSessionId) {
          const validPrescriptions = await tx
            .select({
              id: prescription.id,
              plannedBlockId: prescription.plannedBlockId,
              movementId: prescription.movementId,
              complexVersionId: prescription.complexVersionId,
            })
            .from(prescription)
            .innerJoin(plannedBlock, eq(prescription.plannedBlockId, plannedBlock.id))
            .where(
              and(
                eq(plannedBlock.plannedSessionId, content.plannedSessionId),
                inArray(prescription.id, [...checkablePrescriptions]),
              ),
            );
          const plannedBlockByPrescription = new Map(
            validPrescriptions.map(({ id, plannedBlockId }) => [id, plannedBlockId]),
          );
          for (const reference of prescriptionReferences) {
            if (!reference.plannedBlockId || !content.plannedSessionId) continue;
            if (plannedBlockByPrescription.get(reference.id) !== reference.plannedBlockId) {
              issues.push({
                path: reference.path,
                message: "Unknown planned prescription for the selected block.",
              });
            }
          }
          for (const row of validPrescriptions) {
            plannedPrescriptionDetails.set(row.id, {
              movementId: row.movementId,
              complexVersionId: row.complexVersionId,
            });
          }
        }

        const explicitAttemptMovementReferences = content.blocks.flatMap((block, blockIndex) =>
          (block.attempts ?? []).flatMap((attempt, attemptIndex) =>
            attempt.movementId
              ? [
                  {
                    id: attempt.movementId,
                    path: `blocks[${blockIndex}].attempts[${attemptIndex}].movementId`,
                  },
                ]
              : [],
          ),
        );
        if (explicitAttemptMovementReferences.length > 0) {
          const validAttemptMovements = await tx
            .select({ id: movement.id })
            .from(movement)
            .where(
              and(
                isNull(movement.archivedAt),
                inArray(movement.id, [
                  ...new Set(explicitAttemptMovementReferences.map(({ id }) => id)),
                ]),
              ),
            );
          issues.push(
            ...missingIssues(
              explicitAttemptMovementReferences,
              new Set(validAttemptMovements.map(({ id }) => id)),
              "movement",
            ),
          );
        }

        const explicitAttemptComplexReferences = content.blocks.flatMap((block, blockIndex) =>
          (block.attempts ?? []).flatMap((attempt, attemptIndex) =>
            attempt.complexVersionId
              ? [
                  {
                    id: attempt.complexVersionId,
                    path: `blocks[${blockIndex}].attempts[${attemptIndex}].complexVersionId`,
                  },
                ]
              : [],
          ),
        );
        if (explicitAttemptComplexReferences.length > 0) {
          const validAttemptComplexes = await tx
            .select({ id: complexVersion.id })
            .from(complexVersion)
            .where(
              and(
                ne(complexVersion.status, "archived"),
                inArray(complexVersion.id, [
                  ...new Set(explicitAttemptComplexReferences.map(({ id }) => id)),
                ]),
              ),
            );
          issues.push(
            ...missingIssues(
              explicitAttemptComplexReferences,
              new Set(validAttemptComplexes.map(({ id }) => id)),
              "complex version",
            ),
          );
        }
        const catalogReferencesToCheck = catalogReferences(content);
        if (catalogReferencesToCheck.length > 0) {
          const validEntries = await tx
            .select({ id: catalogEntry.id, catalogKey: catalog.key })
            .from(catalogEntry)
            .innerJoin(catalog, eq(catalogEntry.catalogId, catalog.id))
            .where(
              and(
                eq(catalogEntry.active, true),
                isNull(catalogEntry.archivedAt),
                inArray(catalogEntry.id, [...new Set(catalogReferencesToCheck.map(({ id }) => id))]),
              ),
            );
          const catalogKeyById = new Map(validEntries.map(({ id, catalogKey }) => [id, catalogKey]));
          for (const reference of catalogReferencesToCheck) {
            const catalogKey = catalogKeyById.get(reference.id);
            if (catalogKey === undefined) {
              issues.push({ path: reference.path, message: `Unknown or invalid ${reference.label}.` });
            } else if (catalogKey !== reference.catalogKey) {
              issues.push({
                path: reference.path,
                message: `Must belong to the ${reference.catalogKey} catalog.`,
              });
            }
          }
        }

        const substitutionMovementIds = [
          ...new Set(
            content.blocks.flatMap((block) =>
              (block.substitutions ?? []).map((item) => item.actualMovementId),
            ),
          ),
        ];
        if (substitutionMovementIds.length > 0) {
          const validMovements = await tx
            .select({ id: movement.id })
            .from(movement)
            .where(and(isNull(movement.archivedAt), inArray(movement.id, substitutionMovementIds)));
          const validMovementIds = new Set(validMovements.map(({ id }) => id));
          content.blocks.forEach((block, blockIndex) => {
            (block.substitutions ?? []).forEach((item, substitutionIndex) => {
              if (!validMovementIds.has(item.actualMovementId)) {
                issues.push({
                  path: `blocks[${blockIndex}].substitutions[${substitutionIndex}].actualMovementId`,
                  message: "Unknown or invalid actual movement.",
                });
              }
            });
          });
        }
        const resolvedAttempts = content.blocks.flatMap((block, blockIndex) =>
          (block.attempts ?? []).map((attempt, attemptIndex) => {
            let movementId = attempt.movementId ?? null;
            let complexVersionId = attempt.complexVersionId ?? null;
            if (attempt.plannedPrescriptionId) {
              const substitution = (block.substitutions ?? []).find(
                (item) => item.plannedPrescriptionId === attempt.plannedPrescriptionId,
              );
              if (substitution) {
                movementId = substitution.actualMovementId;
                complexVersionId = null;
              } else {
                const planned = plannedPrescriptionDetails.get(attempt.plannedPrescriptionId);
                movementId = planned?.movementId ?? null;
                complexVersionId = planned?.complexVersionId ?? null;
              }
            }
            if (!movementId && !complexVersionId) {
              issues.push({
                path: `blocks[${blockIndex}].attempts[${attemptIndex}]`,
                message: "Requires a movement or complex.",
              });
            }
            return {
              blockId: block.id,
              attempt,
              movementId,
              complexVersionId,
            };
          }),
        );
        if (issues.length > 0) throw new ExecutionValidationError(issues);

        const now = new Date();
        const revision = existing ? existing.revision + 1 : 1;
        const executionValues = {
          athleteId: localAthlete.id,
          plannedSessionId: content.plannedSessionId,
          executionDate: content.executionDate,
          status: content.status,
          revision,
          contentHash,
          generalNote: content.generalNote,
          updatedAt: now,
          annulledAt: content.status === "annulled" ? now : null,
        };
        if (existing) {
          await tx.update(sessionExecution).set(executionValues).where(eq(sessionExecution.id, executionId));
          await tx.delete(blockExecution).where(eq(blockExecution.sessionExecutionId, executionId));
          await tx.delete(feeling).where(eq(feeling.sessionExecutionId, executionId));
        } else {
          await tx.insert(sessionExecution).values({ id: executionId, ...executionValues, createdAt: now });
        }
        await tx.insert(blockExecution).values(
          content.blocks.map((block) => ({
            id: block.id,
            sessionExecutionId: executionId,
            plannedBlockId: block.plannedBlockId,
            position: block.position,
            blockTypeId: block.blockTypeId,
            title: block.title,
            status: block.status,
            withoutMetrics: block.withoutMetrics,
            notes: block.notes,
          })),
        );
        if (resolvedAttempts.length > 0) {
          await tx.insert(setAttempt).values(
            resolvedAttempts.map(({ blockId, attempt, movementId, complexVersionId }) => ({
              id: attempt.id,
              blockExecutionId: blockId,
              plannedPrescriptionId: attempt.plannedPrescriptionId ?? null,
              position: attempt.position,
              movementId,
              complexVersionId,
              status: attempt.status,
              note: attempt.note ?? null,
            })),
          );
        }
        const metrics = [
          ...content.blocks.flatMap((block) => typedMetricValues(localAthlete.id, block)),
          ...resolvedAttempts.flatMap(({ attempt }) =>
            attemptMetricValues(localAthlete.id, attempt),
          ),
        ];
        if (metrics.length > 0) await tx.insert(typedMetric).values(metrics);

        const feelings = [
          ...(content.feeling
            ? [
                {
                  id: content.feeling.id,
                  athleteId: localAthlete.id,
                  sessionExecutionId: executionId,
                  ...feelingValues(content.feeling),
                },
              ]
            : []),
          ...content.blocks.flatMap((block) =>
            block.feeling
              ? [
                  {
                    id: block.feeling.id,
                    athleteId: localAthlete.id,
                    blockExecutionId: block.id,
                    ...feelingValues(block.feeling),
                  },
                ]
              : [],
          ),
        ];
        if (feelings.length > 0) await tx.insert(feeling).values(feelings);

        const substitutions = content.blocks.flatMap((block) =>
          (block.substitutions ?? []).map((item) => substitutionValues(block.id, item)),
        );
        if (substitutions.length > 0) await tx.insert(substitution).values(substitutions);

        return {
          id: executionId,
          revision,
          status: content.status,
          updatedAt: now.toISOString(),
          result: "persisted",
        };
      });
    },
  };
}
