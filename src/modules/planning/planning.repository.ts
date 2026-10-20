import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import {
  athlete,
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
import type { PlanningWeekReader, PlanningWeekView } from "./planning.types.js";

export function createPlanningWeekReader(database: Database): PlanningWeekReader {
  return {
    async getWeek(weekStart) {
      const [week] = await database
        .select({
          id: plannedWeek.id,
          trainingPlanId: trainingPlan.id,
          planVersionId: planVersion.id,
          planTitle: trainingPlan.title,
          weekStart: plannedWeek.weekStart,
          title: plannedWeek.title,
          priorities: plannedWeek.priorities,
        })
        .from(plannedWeek)
        .innerJoin(planVersion, eq(plannedWeek.planVersionId, planVersion.id))
        .innerJoin(trainingPlan, eq(planVersion.trainingPlanId, trainingPlan.id))
        .innerJoin(athlete, eq(trainingPlan.ownerAthleteId, athlete.id))
        .where(
          and(
            eq(athlete.profileKey, "local"),
            eq(athlete.active, true),
            isNull(trainingPlan.archivedAt),
            eq(planVersion.status, "published"),
            eq(plannedWeek.weekStart, weekStart),
          ),
        )
        .orderBy(desc(planVersion.publishedAt), desc(planVersion.versionNumber))
        .limit(1);
      if (!week) return null;

      const sessions = await database
        .select({
          id: plannedSession.id,
          externalId: plannedSession.externalId,
          plannedDate: plannedSession.plannedDate,
          title: plannedSession.title,
          objective: plannedSession.objective,
          durationSeconds: plannedSession.durationSeconds,
          targetRpe: plannedSession.targetRpe,
        })
        .from(plannedSession)
        .where(eq(plannedSession.plannedWeekId, week.id))
        .orderBy(asc(plannedSession.plannedDate), asc(plannedSession.id));
      const sessionIds = sessions.map(({ id }) => id);
      const blocks = sessionIds.length
        ? await database
            .select({
              id: plannedBlock.id,
              plannedSessionId: plannedBlock.plannedSessionId,
              position: plannedBlock.position,
              blockTypeId: catalogEntry.id,
              blockTypeCode: catalogEntry.code,
              blockTypeDescription: catalogEntry.description,
              title: plannedBlock.title,
              instructions: plannedBlock.instructions,
              durationSeconds: plannedBlock.durationSeconds,
              targetRpe: plannedBlock.targetRpe,
            })
            .from(plannedBlock)
            .innerJoin(catalogEntry, eq(plannedBlock.blockTypeId, catalogEntry.id))
            .where(inArray(plannedBlock.plannedSessionId, sessionIds))
            .orderBy(asc(plannedBlock.position))
        : [];
      const blockIds = blocks.map(({ id }) => id);
      const prescriptions = blockIds.length
        ? await database
            .select({
              id: prescription.id,
              plannedBlockId: prescription.plannedBlockId,
              position: prescription.position,
              details: prescription.details,
              notes: prescription.notes,
              movementId: movement.id,
              movementCode: movement.code,
              movementName: movement.name,
              complexVersionId: complexVersion.id,
              complexCode: complex.code,
              complexName: complex.name,
              complexVersionNumber: complexVersion.versionNumber,
            })
            .from(prescription)
            .leftJoin(movement, eq(prescription.movementId, movement.id))
            .leftJoin(complexVersion, eq(prescription.complexVersionId, complexVersion.id))
            .leftJoin(complex, eq(complexVersion.complexId, complex.id))
            .where(inArray(prescription.plannedBlockId, blockIds))
            .orderBy(asc(prescription.position))
        : [];

      const view: PlanningWeekView = {
        ...week,
        sessions: sessions.map((session) => ({
          ...session,
          blocks: blocks
            .filter((block) => block.plannedSessionId === session.id)
            .map((block) => ({
              id: block.id,
              position: block.position,
              blockType: {
                id: block.blockTypeId,
                code: block.blockTypeCode,
                description: block.blockTypeDescription,
              },
              title: block.title,
              instructions: block.instructions,
              durationSeconds: block.durationSeconds,
              targetRpe: block.targetRpe,
              prescriptions: prescriptions
                .filter((item) => item.plannedBlockId === block.id)
                .map((item) => ({
                  id: item.id,
                  position: item.position,
                  movement:
                    item.movementId && item.movementCode && item.movementName
                      ? { id: item.movementId, code: item.movementCode, name: item.movementName }
                      : null,
                  complex:
                    item.complexVersionId && item.complexCode && item.complexName && item.complexVersionNumber
                      ? {
                          id: item.complexVersionId,
                          code: item.complexCode,
                          name: item.complexName,
                          versionNumber: item.complexVersionNumber,
                        }
                      : null,
                  details: item.details,
                  notes: item.notes,
                })),
            })),
        })),
      };
      return view;
    },
  };
}
