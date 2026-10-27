import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { complex, complexVersion, movement, personalRecord } from "../../db/schema.js";
import {
  bestConfirmedLoad,
  findLocalAthleteId,
  findPersonalRecordById,
  loadPersonalRecordView,
} from "./personal-records.repository.js";
import {
  PersonalRecordConflictError,
  PersonalRecordNotFoundError,
  PersonalRecordValidationError,
  type ManualPersonalRecordInput,
  type PersonalRecordWriter,
} from "./personal-records.types.js";

export function createPersonalRecordWriter(database: Database): PersonalRecordWriter {
  return {
    async createManual(id: string, input: ManualPersonalRecordInput) {
      const athleteId = await findLocalAthleteId(database);

      if (input.movementId) {
        const [found] = await database
          .select({ id: movement.id })
          .from(movement)
          .where(and(eq(movement.id, input.movementId), isNull(movement.archivedAt)))
          .limit(1);
        if (!found) {
          throw new PersonalRecordValidationError([
            { path: "movementId", message: "Unknown or archived movement." },
          ]);
        }
      }
      if (input.complexVersionId) {
        const [found] = await database
          .select({ id: complexVersion.id })
          .from(complexVersion)
          .innerJoin(complex, eq(complexVersion.complexId, complex.id))
          .where(
            and(
              eq(complexVersion.id, input.complexVersionId),
              eq(complexVersion.status, "published"),
              isNull(complex.archivedAt),
            ),
          )
          .limit(1);
        if (!found) {
          throw new PersonalRecordValidationError([
            { path: "complexVersionId", message: "Unknown or unpublished complex version." },
          ]);
        }
      }

      const [existing] = await database
        .select({
          id: personalRecord.id,
          athleteId: personalRecord.athleteId,
          sourceType: personalRecord.sourceType,
        })
        .from(personalRecord)
        .where(eq(personalRecord.id, id))
        .limit(1);

      const now = new Date();
      if (existing && existing.athleteId !== athleteId) {
        throw new PersonalRecordConflictError(
          "record_id_conflict",
          "The record identifier is already in use.",
        );
      }
      if (existing && existing.sourceType !== "manual_historical") {
        throw new PersonalRecordConflictError(
          "manual_record_immutable",
          "Only manual historical records can be edited.",
        );
      }

      const values = {
        athleteId,
        setAttemptId: null,
        movementId: input.movementId ?? null,
        complexVersionId: input.complexVersionId ?? null,
        repetitions: input.repetitions,
        loadKg: input.loadKg,
        achievedOn: input.achievedOn,
        status: "confirmed" as const,
        sourceType: "manual_historical" as const,
        confirmedAt: now,
        note: input.note ?? null,
        updatedAt: now,
      };

      if (existing) {
        await database.update(personalRecord).set(values).where(eq(personalRecord.id, id));
      } else {
        await database.insert(personalRecord).values({ id, ...values, createdAt: now });
      }

      const view = await loadPersonalRecordView(database, athleteId, id);
      if (!view) throw new PersonalRecordNotFoundError();
      return view;
    },

    async decide(id: string, decision: "confirmed" | "discarded") {
      const athleteId = await findLocalAthleteId(database);
      const row = await findPersonalRecordById(database, athleteId, id);
      if (!row) throw new PersonalRecordNotFoundError();
      if (row.status === decision) {
        const view = await loadPersonalRecordView(database, athleteId, id);
        if (!view) throw new PersonalRecordNotFoundError();
        return view;
      }
      if (row.status !== "suggested") {
        throw new PersonalRecordConflictError(
          "record_not_suggested",
          "Only suggested records can be confirmed or discarded.",
        );
      }

      const now = new Date();
      if (decision === "confirmed") {
        const current = await bestConfirmedLoad(
          database,
          athleteId,
          {
            movementId: row.movementId ?? undefined,
            complexVersionId: row.complexVersionId ?? undefined,
          },
          row.repetitions,
          id,
        );
        if (current !== null && row.loadKg <= current) {
          throw new PersonalRecordConflictError(
            "not_better_than_current",
            "The suggested load is not better than the current personal record.",
          );
        }
        await database
          .update(personalRecord)
          .set({ status: "confirmed", confirmedAt: now, updatedAt: now })
          .where(eq(personalRecord.id, id));
      } else {
        await database
          .update(personalRecord)
          .set({ status: "discarded", confirmedAt: null, updatedAt: now })
          .where(eq(personalRecord.id, id));
      }

      const view = await loadPersonalRecordView(database, athleteId, id);
      if (!view) throw new PersonalRecordNotFoundError();
      return view;
    },
  };
}
