import { and, eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { athlete } from "../../db/schema.js";
import {
  ProgressLocalAthleteNotFoundError,
  type MovementFamilyReference,
  type MovementReference,
  type ProgressReader,
  type VolumeAggregate,
  type VolumeGroupBy,
  type VolumeItem,
  type VolumeQuery,
  type VolumeResponse,
} from "./progress.types.js";

type VolumeRow = {
  movement_id: string | null;
  movement_code: string | null;
  movement_name: string | null;
  family_id: string;
  family_code: string;
  family_name: string;
  repetitions: string | number | null;
  technical_repetitions: string | number | null;
  duration_seconds: string | number | null;
  technical_duration_seconds: string | number | null;
  volume_kg: string | number | null;
  technical_volume_kg: string | number | null;
  sessions: string | number | null;
  last_practiced_on: string | null;
};

function attemptValues(athleteId: string, from: string, to: string): SQL {
  return sql`
    attempt_values as (
      select
        se.id as session_id,
        se.execution_date,
        m.id as movement_id,
        m.code as movement_code,
        m.name as movement_name,
        mf.id as family_id,
        mf.code as family_code,
        mf.name as family_name,
        ce.code = 'technique' as technical,
        max(
          case
            when tm.metric_type = 'repetitions' then tm.numeric_value
          end
        ) as repetitions,
        max(
          case
            when tm.metric_type = 'weight' and tm.unit = 'kg' then tm.numeric_value
            when tm.metric_type = 'weight' and tm.unit = 'lb' then tm.numeric_value * 0.45359237
          end
        ) as weight_kg,
        max(
          case
            when tm.metric_type = 'duration' then tm.numeric_value
          end
        ) as duration_seconds
      from set_attempt sa
      inner join block_execution be on be.id = sa.block_execution_id
      inner join session_execution se on se.id = be.session_execution_id
      inner join movement m on m.id = sa.movement_id
      inner join movement_family mf on mf.id = m.family_id
      inner join catalog_entry ce on ce.id = be.block_type_id
      left join typed_metric tm
        on tm.set_attempt_id = sa.id
        and tm.metric_type in ('repetitions', 'weight', 'duration')
      where se.athlete_id = ${athleteId}
        and se.status = 'completed'
        and se.execution_date between ${from} and ${to}
        and be.status in ('completed', 'partial')
        and be.without_metrics = false
        and sa.status = 'completed'
        and sa.movement_id is not null
      group by
        sa.id,
        se.id,
        se.execution_date,
        m.id,
        m.code,
        m.name,
        mf.id,
        mf.code,
        mf.name,
        ce.code
    )
  `;
}

function numeric(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: string | number | null | undefined, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(numeric(value) * factor) / factor;
}

function aggregate(row: VolumeRow): VolumeAggregate {
  return {
    repetitions: Math.round(numeric(row.repetitions)),
    technicalRepetitions: Math.round(numeric(row.technical_repetitions)),
    durationSeconds: rounded(row.duration_seconds),
    technicalDurationSeconds: rounded(row.technical_duration_seconds),
    volumeKg: rounded(row.volume_kg),
    technicalVolumeKg: rounded(row.technical_volume_kg),
    sessions: Math.round(numeric(row.sessions)),
    lastPracticedOn: row.last_practiced_on ?? null,
  };
}

function movement(row: VolumeRow): MovementReference | null {
  if (!row.movement_id || !row.movement_code || !row.movement_name) return null;
  return {
    id: row.movement_id,
    code: row.movement_code,
    name: row.movement_name,
  };
}

function family(row: VolumeRow): MovementFamilyReference {
  return {
    id: row.family_id,
    code: row.family_code,
    name: row.family_name,
  };
}

async function findLocalAthleteId(database: Database): Promise<string> {
  const [row] = await database
    .select({ id: athlete.id })
    .from(athlete)
    .where(and(eq(athlete.profileKey, "local"), eq(athlete.active, true)))
    .limit(1);
  if (!row) throw new ProgressLocalAthleteNotFoundError();
  return row.id;
}

function itemsQuery(athleteId: string, query: VolumeQuery): SQL {
  if (query.groupBy === "family") {
    return sql`
      with ${attemptValues(athleteId, query.from, query.to)}
      select
        null::uuid as movement_id,
        null::text as movement_code,
        null::text as movement_name,
        family_id,
        family_code,
        family_name,
        coalesce(sum(repetitions), 0) as repetitions,
        coalesce(sum(case when technical then repetitions else 0 end), 0) as technical_repetitions,
        coalesce(sum(duration_seconds), 0) as duration_seconds,
        coalesce(sum(case when technical then duration_seconds else 0 end), 0) as technical_duration_seconds,
        coalesce(sum(weight_kg * repetitions), 0) as volume_kg,
        coalesce(sum(case when technical then weight_kg * repetitions else 0 end), 0) as technical_volume_kg,
        count(distinct session_id) as sessions,
        max(execution_date)::text as last_practiced_on
      from attempt_values
      group by family_id, family_code, family_name
      order by technical_repetitions desc, repetitions desc, family_name asc
    `;
  }

  return sql`
    with ${attemptValues(athleteId, query.from, query.to)}
    select
      movement_id,
      movement_code,
      movement_name,
      family_id,
      family_code,
      family_name,
      coalesce(sum(repetitions), 0) as repetitions,
      coalesce(sum(case when technical then repetitions else 0 end), 0) as technical_repetitions,
      coalesce(sum(duration_seconds), 0) as duration_seconds,
      coalesce(sum(case when technical then duration_seconds else 0 end), 0) as technical_duration_seconds,
      coalesce(sum(weight_kg * repetitions), 0) as volume_kg,
      coalesce(sum(case when technical then weight_kg * repetitions else 0 end), 0) as technical_volume_kg,
      count(distinct session_id) as sessions,
      max(execution_date)::text as last_practiced_on
    from attempt_values
    group by movement_id, movement_code, movement_name, family_id, family_code, family_name
    order by technical_repetitions desc, repetitions desc, movement_name asc
  `;
}

function totalsQuery(athleteId: string, query: VolumeQuery): SQL {
  return sql`
    with ${attemptValues(athleteId, query.from, query.to)}
    select
      coalesce(sum(repetitions), 0) as repetitions,
      coalesce(sum(case when technical then repetitions else 0 end), 0) as technical_repetitions,
      coalesce(sum(duration_seconds), 0) as duration_seconds,
      coalesce(sum(case when technical then duration_seconds else 0 end), 0) as technical_duration_seconds,
      coalesce(sum(weight_kg * repetitions), 0) as volume_kg,
      coalesce(sum(case when technical then weight_kg * repetitions else 0 end), 0) as technical_volume_kg,
      count(distinct session_id) as sessions,
      max(execution_date)::text as last_practiced_on
    from attempt_values
  `;
}

export function createProgressReader(database: Database): ProgressReader {
  return {
    async getVolume(query: VolumeQuery): Promise<VolumeResponse> {
      const athleteId = await findLocalAthleteId(database);
      const [itemsResult, totalsResult] = await Promise.all([
        database.execute<VolumeRow>(itemsQuery(athleteId, query)),
        database.execute<VolumeRow>(totalsQuery(athleteId, query)),
      ]);
      const rows = itemsResult.rows as VolumeRow[];
      const totalsRow = (totalsResult.rows as VolumeRow[])[0];
      return {
        from: query.from,
        to: query.to,
        groupBy: query.groupBy as VolumeGroupBy,
        totals: totalsRow
          ? aggregate(totalsRow)
          : {
              repetitions: 0,
              technicalRepetitions: 0,
              durationSeconds: 0,
              technicalDurationSeconds: 0,
              volumeKg: 0,
              technicalVolumeKg: 0,
              sessions: 0,
              lastPracticedOn: null,
            },
        items: rows.map(
          (row): VolumeItem => ({
            ...aggregate(row),
            movement: movement(row),
            family: family(row),
          }),
        ),
      };
    },
  };
}
