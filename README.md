# CrossFit API

Fastify backend and the single OpenAPI contract for the CrossFit training application.

## Structure

- `openapi.yaml`: versioned HTTP contract; update it with every public API change.
- `src/config`: environment configuration and application settings.
- `src/db`: Drizzle client, schema and seed scripts.
- `src/modules`: domain modules, each owning its routes and persistence access.
- `drizzle`: generated SQL migrations; do not edit generated metadata manually.

## Example planning week

After running migrations and the catalog seed, create an idempotent example for the current week:

```bash
pnpm db:seed:planning-example
```

Set `PLANNING_EXAMPLE_WEEK_START=YYYY-MM-DD` to target a specific Monday. The command resolves catalog IDs from their stable codes and publishes through the same transactional service used by OpenClaw.

## Progress volume

`GET /api/v1/progress/volume?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=movement|family` aggregates completed set attempts from completed sessions. It returns totals and a breakdown by movement or movement family, including repetitions, technical repetitions, bar volume, technical volume, technical practice time, distinct sessions and the last practice date.

Only attempts with `completed` status in blocks without `without_metrics` are counted. Blocks whose type code is `technique` contribute to the technical figures. Complex attempts are excluded from the movement/family breakdown because they do not reference a single movement.

## Technical practice duration

Set attempts accept an optional `durationSeconds` value between 1 and 86400. The API persists it as a `typed_metric` of type `duration` with unit `s`; the PWA exposes the field only for `technique` blocks. Migration `0009_duration_metric.sql` extends the metric and unit constraints.
