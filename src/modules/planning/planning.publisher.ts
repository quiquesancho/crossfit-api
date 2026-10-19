import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import {
  athlete,
  catalog,
  catalogEntry,
  complex,
  complexVersion,
  movement,
  planVersion,
  plannedBlock,
  plannedSession,
  plannedWeek,
  prescription,
  trainingPlan,
} from "../../db/schema.js";
import { hashPlanningPublication } from "./planning.hash.js";
import {
  LocalAthleteNotFoundError,
  PlanningValidationError,
  PlanningVersionConflictError,
  type PlanningPublication,
  type PlanningPublisher,
  type ValidationIssue,
} from "./planning.types.js";

type Reference = { id: string; path: string };

function collectReferences(publication: PlanningPublication) {
  const blockTypes: Reference[] = [];
  const movements: Reference[] = [];
  const complexVersions: Reference[] = [];

  publication.weeks.forEach((week, weekIndex) =>
    week.sessions.forEach((session, sessionIndex) =>
      session.blocks.forEach((block, blockIndex) => {
        const blockPath = `weeks[${weekIndex}].sessions[${sessionIndex}].blocks[${blockIndex}]`;
        blockTypes.push({ id: block.blockTypeId, path: `${blockPath}.blockTypeId` });
        block.prescriptions?.forEach((item, prescriptionIndex) => {
          const path = `${blockPath}.prescriptions[${prescriptionIndex}]`;
          if (item.movementId) movements.push({ id: item.movementId, path: `${path}.movementId` });
          if (item.complexVersionId) {
            complexVersions.push({ id: item.complexVersionId, path: `${path}.complexVersionId` });
          }
        });
      }),
    ),
  );

  return { blockTypes, movements, complexVersions };
}

function missingReferenceIssues(references: Reference[], foundIds: Set<string>, label: string): ValidationIssue[] {
  return references
    .filter((reference) => !foundIds.has(reference.id))
    .map((reference) => ({ path: reference.path, message: `Unknown or inactive ${label}.` }));
}

export function createPlanningPublisher(database: Database): PlanningPublisher {
  return {
    async publish(externalPlanId, publication) {
      const sourceHash = hashPlanningPublication(publication);

      return database.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`openclaw:${externalPlanId}`}))`);

        const [localAthlete] = await tx
          .select({ id: athlete.id })
          .from(athlete)
          .where(and(eq(athlete.profileKey, "local"), eq(athlete.active, true)))
          .limit(1);
        if (!localAthlete) throw new LocalAthleteNotFoundError();

        const [existingPlan] = await tx
          .select({ id: trainingPlan.id })
          .from(trainingPlan)
          .where(
            and(
              eq(trainingPlan.ownerAthleteId, localAthlete.id),
              eq(trainingPlan.externalSource, "openclaw"),
              eq(trainingPlan.externalId, externalPlanId),
              isNull(trainingPlan.archivedAt),
            ),
          )
          .limit(1);
        const [existingVersion] = existingPlan
          ? await tx
              .select({ id: planVersion.id, sourceHash: planVersion.sourceHash })
              .from(planVersion)
              .where(
                and(
                  eq(planVersion.trainingPlanId, existingPlan.id),
                  eq(planVersion.sourceVersion, publication.sourceVersion),
                ),
              )
              .limit(1)
          : [];
        if (existingPlan && existingVersion) {
          if (existingVersion.sourceHash !== sourceHash) throw new PlanningVersionConflictError();
          return { trainingPlanId: existingPlan.id, planVersionId: existingVersion.id, status: "unchanged" };
        }

        const references = collectReferences(publication);
        const blockTypeIds = [...new Set(references.blockTypes.map(({ id }) => id))];
        const movementIds = [...new Set(references.movements.map(({ id }) => id))];
        const complexVersionIds = [...new Set(references.complexVersions.map(({ id }) => id))];

        const validBlockTypes = blockTypeIds.length
          ? await tx
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
              )
          : [];
        const validMovements = movementIds.length
          ? await tx
              .select({ id: movement.id })
              .from(movement)
              .where(and(isNull(movement.archivedAt), inArray(movement.id, movementIds)))
          : [];
        const validComplexVersions = complexVersionIds.length
          ? await tx
              .select({ id: complexVersion.id })
              .from(complexVersion)
              .innerJoin(complex, eq(complexVersion.complexId, complex.id))
              .where(
                and(
                  eq(complexVersion.status, "published"),
                  isNull(complex.archivedAt),
                  inArray(complexVersion.id, complexVersionIds),
                ),
              )
          : [];

        const referenceIssues = [
          ...missingReferenceIssues(
            references.blockTypes,
            new Set(validBlockTypes.map(({ id }) => id)),
            "block type",
          ),
          ...missingReferenceIssues(
            references.movements,
            new Set(validMovements.map(({ id }) => id)),
            "movement",
          ),
          ...missingReferenceIssues(
            references.complexVersions,
            new Set(validComplexVersions.map(({ id }) => id)),
            "complex version",
          ),
        ];
        if (referenceIssues.length > 0) throw new PlanningValidationError(referenceIssues);

        const trainingPlanId = existingPlan
          ? existingPlan.id
          : (
              await tx
                .insert(trainingPlan)
                .values({
                  ownerAthleteId: localAthlete.id,
                  externalSource: "openclaw",
                  externalId: externalPlanId,
                  title: publication.title,
                })
                .returning({ id: trainingPlan.id })
            )[0]?.id;
        if (!trainingPlanId) throw new Error("Failed to create the training plan.");

        if (existingPlan) {
          await tx.update(trainingPlan).set({ title: publication.title }).where(eq(trainingPlan.id, trainingPlanId));
        }

        const [latestVersion] = await tx
          .select({ number: max(planVersion.versionNumber) })
          .from(planVersion)
          .where(eq(planVersion.trainingPlanId, trainingPlanId));
        const versionNumber = (latestVersion?.number ?? 0) + 1;
        const publishedAt = new Date();
        const [createdVersion] = await tx
          .insert(planVersion)
          .values({
            trainingPlanId,
            versionNumber,
            sourceVersion: publication.sourceVersion,
            sourceHash,
            status: "published",
            publishedAt,
          })
          .returning({ id: planVersion.id });
        if (!createdVersion) throw new Error("Failed to create the plan version.");

        for (const [weekIndex, week] of publication.weeks.entries()) {
          const [createdWeek] = await tx
            .insert(plannedWeek)
            .values({
              planVersionId: createdVersion.id,
              weekStart: week.weekStart,
              position: weekIndex + 1,
              title: week.title,
              priorities: week.priorities,
            })
            .returning({ id: plannedWeek.id });
          if (!createdWeek) throw new Error("Failed to create a planned week.");

          for (const session of week.sessions) {
            const [createdSession] = await tx
              .insert(plannedSession)
              .values({
                plannedWeekId: createdWeek.id,
                externalId: session.externalId,
                plannedDate: session.plannedDate,
                title: session.title,
                objective: session.objective,
                durationSeconds: session.durationSeconds,
                targetRpe: session.targetRpe,
              })
              .returning({ id: plannedSession.id });
            if (!createdSession) throw new Error("Failed to create a planned session.");

            for (const [blockIndex, block] of session.blocks.entries()) {
              const [createdBlock] = await tx
                .insert(plannedBlock)
                .values({
                  plannedSessionId: createdSession.id,
                  position: blockIndex + 1,
                  blockTypeId: block.blockTypeId,
                  title: block.title,
                  instructions: block.instructions,
                  durationSeconds: block.durationSeconds,
                  targetRpe: block.targetRpe,
                })
                .returning({ id: plannedBlock.id });
              if (!createdBlock) throw new Error("Failed to create a planned block.");

              const prescriptions = block.prescriptions ?? [];
              if (prescriptions.length > 0) {
                await tx.insert(prescription).values(
                  prescriptions.map((item, prescriptionIndex) => ({
                    plannedBlockId: createdBlock.id,
                    position: prescriptionIndex + 1,
                    movementId: item.movementId,
                    complexVersionId: item.complexVersionId,
                    details: item.details ?? {},
                    notes: item.notes,
                  })),
                );
              }
            }
          }
        }

        return { trainingPlanId, planVersionId: createdVersion.id, status: "published" };
      });
    },
  };
}
