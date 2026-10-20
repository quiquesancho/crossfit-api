import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import {
  athlete,
  blockExecution,
  catalog,
  catalogEntry,
  planVersion,
  plannedBlock,
  plannedSession,
  plannedWeek,
  sessionExecution,
  trainingPlan,
} from "../../db/schema.js";
import { hashSessionExecution } from "./execution.hash.js";
import {
  ExecutionLocalAthleteNotFoundError,
  ExecutionRevisionConflictError,
  ExecutionValidationError,
  type ExecutionValidationIssue,
  type SessionExecutionWriter,
} from "./execution.types.js";

function missingIssues(references: Array<{ id: string; path: string }>, foundIds: Set<string>, label: string) {
  return references
    .filter(({ id }) => !foundIds.has(id))
    .map(({ path }) => ({ path, message: `Unknown or invalid ${label}.` }));
}

export function createSessionExecutionWriter(database: Database): SessionExecutionWriter {
  return {
    async synchronize(executionId, snapshot) {
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
        if (snapshot.plannedSessionId) {
          const [ownedSession] = await tx
            .select({ id: plannedSession.id })
            .from(plannedSession)
            .innerJoin(plannedWeek, eq(plannedSession.plannedWeekId, plannedWeek.id))
            .innerJoin(planVersion, eq(plannedWeek.planVersionId, planVersion.id))
            .innerJoin(trainingPlan, eq(planVersion.trainingPlanId, trainingPlan.id))
            .where(
              and(
                eq(plannedSession.id, snapshot.plannedSessionId),
                eq(trainingPlan.ownerAthleteId, localAthlete.id),
              ),
            )
            .limit(1);
          if (!ownedSession) {
            issues.push({ path: "plannedSessionId", message: "Unknown planned session for the local athlete." });
          }
        }

        const blockTypeReferences = snapshot.blocks.map((block, index) => ({
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

        const plannedBlockReferences = snapshot.blocks.flatMap((block, index) =>
          block.plannedBlockId ? [{ id: block.plannedBlockId, path: `blocks[${index}].plannedBlockId` }] : [],
        );
        if (plannedBlockReferences.length > 0 && snapshot.plannedSessionId) {
          const validPlannedBlocks = await tx
            .select({ id: plannedBlock.id })
            .from(plannedBlock)
            .where(
              and(
                eq(plannedBlock.plannedSessionId, snapshot.plannedSessionId),
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
        if (issues.length > 0) throw new ExecutionValidationError(issues);

        const now = new Date();
        const revision = existing ? existing.revision + 1 : 1;
        const executionValues = {
          athleteId: localAthlete.id,
          plannedSessionId: snapshot.plannedSessionId,
          executionDate: snapshot.executionDate,
          status: snapshot.status,
          revision,
          contentHash,
          generalNote: snapshot.generalNote,
          updatedAt: now,
          annulledAt: snapshot.status === "annulled" ? now : null,
        };
        if (existing) {
          await tx.update(sessionExecution).set(executionValues).where(eq(sessionExecution.id, executionId));
          await tx.delete(blockExecution).where(eq(blockExecution.sessionExecutionId, executionId));
        } else {
          await tx.insert(sessionExecution).values({ id: executionId, ...executionValues, createdAt: now });
        }
        await tx.insert(blockExecution).values(
          snapshot.blocks.map((block) => ({
            ...block,
            sessionExecutionId: executionId,
          })),
        );

        return {
          id: executionId,
          revision,
          status: snapshot.status,
          updatedAt: now.toISOString(),
          result: "persisted",
        };
      });
    },
  };
}
