import { and, asc, desc, eq, inArray, lt, ne, or } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { athlete, complex, complexVersion, movement, personalRecord } from "../../db/schema.js";
import { encodePersonalRecordCursor } from "./personal-records.cursor.js";
import {
  PersonalRecordLocalAthleteNotFoundError,
  type PersonalRecordListQuery,
  type PersonalRecordPage,
  type PersonalRecordReader,
  type PersonalRecordView,
} from "./personal-records.types.js";

type Reader = Pick<Database, "select">;

const recordColumns = {
  id: personalRecord.id,
  status: personalRecord.status,
  sourceType: personalRecord.sourceType,
  setAttemptId: personalRecord.setAttemptId,
  movementId: personalRecord.movementId,
  movementCode: movement.code,
  movementName: movement.name,
  complexVersionId: personalRecord.complexVersionId,
  complexCode: complex.code,
  complexName: complex.name,
  complexVersionNumber: complexVersion.versionNumber,
  repetitions: personalRecord.repetitions,
  loadKg: personalRecord.loadKg,
  achievedOn: personalRecord.achievedOn,
  confirmedAt: personalRecord.confirmedAt,
  note: personalRecord.note,
};

type RecordRow = {
  id: string;
  status: string;
  sourceType: string;
  setAttemptId: string | null;
  movementId: string | null;
  movementCode: string | null;
  movementName: string | null;
  complexVersionId: string | null;
  complexCode: string | null;
  complexName: string | null;
  complexVersionNumber: number | null;
  repetitions: number;
  loadKg: number;
  achievedOn: string;
  confirmedAt: Date | null;
  note: string | null;
};

function toView(row: RecordRow): PersonalRecordView {
  return {
    id: row.id,
    status: row.status as PersonalRecordView["status"],
    sourceType: row.sourceType as PersonalRecordView["sourceType"],
    movement:
      row.movementId && row.movementCode && row.movementName
        ? { id: row.movementId, code: row.movementCode, name: row.movementName }
        : null,
    complex:
      row.complexVersionId && row.complexCode && row.complexName && row.complexVersionNumber
        ? {
            id: row.complexVersionId,
            code: row.complexCode,
            name: row.complexName,
            versionNumber: row.complexVersionNumber,
          }
        : null,
    repetitions: row.repetitions,
    loadKg: row.loadKg,
    achievedOn: row.achievedOn,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    note: row.note,
    originAttemptId: row.setAttemptId,
  };
}

function anchorKey(row: Pick<RecordRow, "movementId" | "complexVersionId" | "repetitions">): string {
  const anchor = row.movementId ? `m:${row.movementId}` : `c:${row.complexVersionId}`;
  return `${anchor}|${row.repetitions}`;
}

export async function findLocalAthleteId(reader: Reader): Promise<string> {
  const [row] = await reader
    .select({ id: athlete.id })
    .from(athlete)
    .where(and(eq(athlete.profileKey, "local"), eq(athlete.active, true)))
    .limit(1);
  if (!row) throw new PersonalRecordLocalAthleteNotFoundError();
  return row.id;
}

function baseQuery(reader: Reader) {
  return reader
    .select(recordColumns)
    .from(personalRecord)
    .leftJoin(movement, eq(personalRecord.movementId, movement.id))
    .leftJoin(complexVersion, eq(personalRecord.complexVersionId, complexVersion.id))
    .leftJoin(complex, eq(complexVersion.complexId, complex.id));
}

export async function loadPersonalRecordView(
  reader: Reader,
  athleteId: string,
  id: string,
): Promise<PersonalRecordView | null> {
  const [row] = await baseQuery(reader)
    .where(and(eq(personalRecord.id, id), eq(personalRecord.athleteId, athleteId)))
    .limit(1);
  return row ? toView(row) : null;
}

export function createPersonalRecordReader(database: Database): PersonalRecordReader {
  return {
    async list(query: PersonalRecordListQuery): Promise<PersonalRecordPage> {
      const athleteId = await findLocalAthleteId(database);
      const filters = [eq(personalRecord.athleteId, athleteId)];
      if (query.status) {
        filters.push(eq(personalRecord.status, query.status));
      } else {
        filters.push(ne(personalRecord.status, "suggested"));
      }
      if (query.movementId) filters.push(eq(personalRecord.movementId, query.movementId));
      if (query.complexVersionId) {
        filters.push(eq(personalRecord.complexVersionId, query.complexVersionId));
      }
      if (query.cursor) {
        filters.push(
          or(
            lt(personalRecord.achievedOn, query.cursor.achievedOn),
            and(
              eq(personalRecord.achievedOn, query.cursor.achievedOn),
              lt(personalRecord.id, query.cursor.id),
            ),
          )!,
        );
      }

      const rows = await baseQuery(database)
        .where(and(...filters))
        .orderBy(desc(personalRecord.achievedOn), desc(personalRecord.id))
        .limit(query.limit + 1);

      const page = rows.slice(0, query.limit).map(toView);
      const last = rows.length > query.limit ? page.at(-1) : undefined;
      return {
        items: page,
        nextCursor: last
          ? encodePersonalRecordCursor({ achievedOn: last.achievedOn, id: last.id })
          : null,
      };
    },

    async listCurrent(): Promise<PersonalRecordView[]> {
      const athleteId = await findLocalAthleteId(database);
      const rows = await baseQuery(database)
        .where(
          and(eq(personalRecord.athleteId, athleteId), eq(personalRecord.status, "confirmed")),
        )
        .orderBy(
          desc(personalRecord.loadKg),
          asc(personalRecord.achievedOn),
          asc(personalRecord.id),
        );

      const best = new Map<string, RecordRow>();
      for (const row of rows) {
        const key = anchorKey(row);
        if (!best.has(key)) best.set(key, row);
      }

      return [...best.values()]
        .map(toView)
        .sort((left, right) => {
          const leftName = left.movement?.name ?? left.complex?.name ?? "";
          const rightName = right.movement?.name ?? right.complex?.name ?? "";
          return (
            leftName.localeCompare(rightName, "es") ||
            left.repetitions - right.repetitions ||
            right.loadKg - left.loadKg
          );
        });
    },

    async listSuggestions(): Promise<PersonalRecordView[]> {
      const athleteId = await findLocalAthleteId(database);
      const [suggested, confirmed] = await Promise.all([
        baseQuery(database)
          .where(
            and(eq(personalRecord.athleteId, athleteId), eq(personalRecord.status, "suggested")),
          )
          .orderBy(desc(personalRecord.loadKg), desc(personalRecord.achievedOn)),
        baseQuery(database).where(
          and(eq(personalRecord.athleteId, athleteId), eq(personalRecord.status, "confirmed")),
        ),
      ]);

      const previous = new Map<string, number>();
      for (const row of confirmed) {
        const key = anchorKey(row);
        const current = previous.get(key);
        if (current === undefined || row.loadKg > current) previous.set(key, row.loadKg);
      }

      const best = new Map<string, RecordRow>();
      for (const row of suggested) {
        const key = anchorKey(row);
        const current = best.get(key);
        if (
          !current ||
          row.loadKg > current.loadKg ||
          (row.loadKg === current.loadKg && row.achievedOn > current.achievedOn)
        ) {
          best.set(key, row);
        }
      }

      return [...best.values()]
        .filter((row) => {
          const reference = previous.get(anchorKey(row));
          return reference === undefined || row.loadKg > reference;
        })
        .sort(
          (left, right) =>
            right.achievedOn.localeCompare(left.achievedOn) ||
            right.loadKg - left.loadKg ||
            right.id.localeCompare(left.id),
        )
        .map((row) => ({
          ...toView(row),
          previousLoadKg: previous.get(anchorKey(row)) ?? null,
        }));
    },
  };
}

export async function findPersonalRecordById(
  reader: Reader,
  athleteId: string,
  id: string,
): Promise<RecordRow | null> {
  const [row] = await reader
    .select(recordColumns)
    .from(personalRecord)
    .leftJoin(movement, eq(personalRecord.movementId, movement.id))
    .leftJoin(complexVersion, eq(personalRecord.complexVersionId, complexVersion.id))
    .leftJoin(complex, eq(complexVersion.complexId, complex.id))
    .where(and(eq(personalRecord.id, id), eq(personalRecord.athleteId, athleteId)))
    .limit(1);
  return row ?? null;
}

export async function bestConfirmedLoad(
  reader: Reader,
  athleteId: string,
  anchor: { movementId?: string; complexVersionId?: string },
  repetitions: number,
  excludeId?: string,
): Promise<number | null> {
  const filters = [
    eq(personalRecord.athleteId, athleteId),
    eq(personalRecord.status, "confirmed"),
    eq(personalRecord.repetitions, repetitions),
  ];
  if (anchor.movementId) filters.push(eq(personalRecord.movementId, anchor.movementId));
  if (anchor.complexVersionId) {
    filters.push(eq(personalRecord.complexVersionId, anchor.complexVersionId));
  }
  if (excludeId) filters.push(ne(personalRecord.id, excludeId));

  const rows = await reader
    .select({ loadKg: personalRecord.loadKg })
    .from(personalRecord)
    .where(and(...filters))
    .orderBy(desc(personalRecord.loadKg))
    .limit(1);
  return rows[0]?.loadKg ?? null;
}

export async function confirmedLoadsByAttempt(
  reader: Reader,
  athleteId: string,
  attemptIds: string[],
): Promise<Map<string, number>> {
  if (attemptIds.length === 0) return new Map();
  const rows = await reader
    .select({ attemptId: personalRecord.setAttemptId, loadKg: personalRecord.loadKg })
    .from(personalRecord)
    .where(
      and(
        eq(personalRecord.athleteId, athleteId),
        inArray(personalRecord.setAttemptId, attemptIds),
        inArray(personalRecord.status, ["confirmed", "discarded"]),
      ),
    );
  return new Map(
    rows.flatMap((row) => (row.attemptId ? [[row.attemptId, row.loadKg] as const] : [])),
  );
}
