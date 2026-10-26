import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  type SQL,
} from "drizzle-orm";

import type { Database } from "../../db/client.js";
import {
  athlete,
  blockExecution,
  feeling,
  planVersion,
  plannedSession,
  plannedWeek,
  sessionExecution,
  trainingPlan,
} from "../../db/schema.js";
import { encodeHistoryCursor } from "./history.cursor.js";
import {
  FREE_TRAINING_TITLE,
  type CalendarPlannedSessionView,
  type CalendarView,
  type ExecutionHistoryPage,
  type ExecutionHistoryQuery,
  type ExecutionHistoryReader,
  type ExecutionSummaryStatus,
  type ExecutionSummaryView,
} from "./history.types.js";

type SummaryRow = {
  id: string;
  executionDate: string;
  status: string;
  plannedSessionId: string | null;
  plannedSessionTitle: string | null;
  revision: number;
  updatedAt: Date;
};

function summaryView(
  row: SummaryRow,
  blockCount: number,
  rpe: number | null,
): ExecutionSummaryView {
  return {
    id: row.id,
    executionDate: row.executionDate,
    status: row.status as ExecutionSummaryStatus,
    origin: row.plannedSessionId ? "planned" : "free",
    title: row.plannedSessionTitle ?? FREE_TRAINING_TITLE,
    plannedSessionId: row.plannedSessionId,
    blockCount,
    rpe,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dateRangeConditions(from?: string, to?: string): SQL[] {
  const conditions: SQL[] = [];
  if (from) conditions.push(gte(sessionExecution.executionDate, from));
  if (to) conditions.push(lte(sessionExecution.executionDate, to));
  return conditions;
}

export function createExecutionHistoryReader(database: Database): ExecutionHistoryReader {
  async function loadSummaries(conditions: SQL[], limit?: number): Promise<SummaryRow[]> {
    const query = database
      .select({
        id: sessionExecution.id,
        executionDate: sessionExecution.executionDate,
        status: sessionExecution.status,
        plannedSessionId: sessionExecution.plannedSessionId,
        plannedSessionTitle: plannedSession.title,
        revision: sessionExecution.revision,
        updatedAt: sessionExecution.updatedAt,
      })
      .from(sessionExecution)
      .innerJoin(athlete, eq(sessionExecution.athleteId, athlete.id))
      .leftJoin(plannedSession, eq(sessionExecution.plannedSessionId, plannedSession.id))
      .where(
        and(
          eq(athlete.profileKey, "local"),
          eq(athlete.active, true),
          ne(sessionExecution.status, "annulled"),
          ...conditions,
        ),
      )
      .orderBy(desc(sessionExecution.executionDate), desc(sessionExecution.id));

    return limit === undefined ? query : query.limit(limit);
  }

  async function blockCounts(
    executionIds: string[],
  ): Promise<Map<string, number>> {
    if (executionIds.length === 0) return new Map();
    const rows = await database
      .select({
        sessionExecutionId: blockExecution.sessionExecutionId,
        total: count(),
      })
      .from(blockExecution)
      .where(inArray(blockExecution.sessionExecutionId, executionIds))
      .groupBy(blockExecution.sessionExecutionId);
    return new Map(rows.map((row) => [row.sessionExecutionId, Number(row.total)]));
  }

  async function sessionRpe(executionIds: string[]): Promise<Map<string, number>> {
    if (executionIds.length === 0) return new Map();
    const rows = await database
      .select({
        sessionExecutionId: feeling.sessionExecutionId,
        rpe: feeling.rpe,
      })
      .from(feeling)
      .where(
        and(
          inArray(feeling.sessionExecutionId, executionIds),
          isNotNull(feeling.rpe),
        ),
      );
    const result = new Map<string, number>();
    for (const row of rows) {
      if (row.sessionExecutionId && row.rpe !== null) result.set(row.sessionExecutionId, row.rpe);
    }
    return result;
  }

  return {
    async listExecutions(query: ExecutionHistoryQuery): Promise<ExecutionHistoryPage> {
      const conditions = dateRangeConditions(query.from, query.to);
      if (query.cursor) {
        conditions.push(
          or(
            lt(sessionExecution.executionDate, query.cursor.executionDate),
            and(
              eq(sessionExecution.executionDate, query.cursor.executionDate),
              lt(sessionExecution.id, query.cursor.id),
            ),
          ) as SQL,
        );
      }

      const rows = await loadSummaries(conditions, query.limit + 1);
      const pageRows = rows.slice(0, query.limit);
      const executionIds = pageRows.map((row) => row.id);
      const [counts, rpes] = await Promise.all([
        blockCounts(executionIds),
        sessionRpe(executionIds),
      ]);

      const items = pageRows.map((row) =>
        summaryView(row, counts.get(row.id) ?? 0, rpes.get(row.id) ?? null),
      );
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > query.limit && last
            ? encodeHistoryCursor({ executionDate: last.executionDate, id: last.id })
            : null,
      };
    },

    async getCalendar(from: string, to: string): Promise<CalendarView> {
      const plannedRows = await database
        .select({
          id: plannedSession.id,
          plannedDate: plannedSession.plannedDate,
          externalId: plannedSession.externalId,
          title: plannedSession.title,
          objective: plannedSession.objective,
        })
        .from(plannedSession)
        .innerJoin(plannedWeek, eq(plannedSession.plannedWeekId, plannedWeek.id))
        .innerJoin(planVersion, eq(plannedWeek.planVersionId, planVersion.id))
        .innerJoin(trainingPlan, eq(planVersion.trainingPlanId, trainingPlan.id))
        .innerJoin(athlete, eq(trainingPlan.ownerAthleteId, athlete.id))
        .where(
          and(
            eq(athlete.profileKey, "local"),
            eq(athlete.active, true),
            isNull(trainingPlan.archivedAt),
            eq(planVersion.status, "published"),
            gte(plannedSession.plannedDate, from),
            lte(plannedSession.plannedDate, to),
          ),
        )
        .orderBy(
          asc(plannedSession.plannedDate),
          desc(planVersion.publishedAt),
          desc(planVersion.versionNumber),
        );

      const seenPlanned = new Set<string>();
      const plannedByDate = new Map<string, CalendarPlannedSessionView[]>();
      for (const row of plannedRows) {
        const key = `${row.plannedDate}|${row.externalId ?? row.title}`;
        if (seenPlanned.has(key)) continue;
        seenPlanned.add(key);
        const entries = plannedByDate.get(row.plannedDate) ?? [];
        entries.push({ id: row.id, title: row.title, objective: row.objective });
        plannedByDate.set(row.plannedDate, entries);
      }

      const rows = await loadSummaries(dateRangeConditions(from, to));
      const executionIds = rows.map((row) => row.id);
      const [counts, rpes] = await Promise.all([
        blockCounts(executionIds),
        sessionRpe(executionIds),
      ]);

      const dates = new Set<string>([...plannedByDate.keys(), ...rows.map((row) => row.executionDate)]);
      const days = [...dates].sort((a, b) => a.localeCompare(b)).map((date) => ({
        date,
        planned: plannedByDate.get(date) ?? [],
        executions: rows
          .filter((row) => row.executionDate === date)
          .map((row) => summaryView(row, counts.get(row.id) ?? 0, rpes.get(row.id) ?? null)),
      }));
      return { days };
    },
  };
}
