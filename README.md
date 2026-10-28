# CrossFit API

Fastify backend and the single OpenAPI contract for the CrossFit training application.

## Structure

- `openapi.yaml`: versioned HTTP contract; update it with every public API change.
- `src/config`: environment configuration and application settings.
- `src/db`: Drizzle client, schema and application bootstrap.
- `src/modules`: domain modules, each owning its routes and persistence access.
- `drizzle`: generated SQL migrations; do not edit generated metadata manually.

## Application bootstrap

After running migrations, bootstrap the local athlete and the application catalogs:

```bash
pnpm db:bootstrap
```

Movement families and movements are not part of the bootstrap. They are data managed through the OpenClaw integration API. Complexes remain read-only and are not seeded.

## Movement catalog import

`PUT /api/v1/integrations/openclaw/movement-catalog` is an idempotent, transactional upsert authenticated with `x-openclaw-service-key`. It accepts optional `families` and `movements` arrays; at least one entry is required. Codes are stable kebab-case identifiers and are unique within each table.

```json
{
  "families": [{ "code": "clean", "name": "Clean" }],
  "movements": [
    { "code": "power-clean", "name": "Power clean", "familyCode": "clean" }
  ]
}
```

Existing movements cannot change family through this endpoint: the API returns `409 movement_family_conflict` to preserve historical volume aggregation. Create a new movement code and archive the old one instead. Entries omitted from the payload are never deleted or archived. `GET /api/v1/catalog/movements` and `GET /api/v1/catalog/movement-families` expose the active catalog.

## Progress volume

`GET /api/v1/progress/volume?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=movement|family` aggregates completed set attempts from completed sessions. It returns totals and a breakdown by movement or movement family, including repetitions, technical repetitions, bar volume, technical volume, technical practice time, distinct sessions and the last practice date.

Only attempts with `completed` status in blocks without `without_metrics` are counted. Blocks whose type code is `technique` contribute to the technical figures. Complex attempts are excluded from the movement/family breakdown because they do not reference a single movement.

## Technical practice duration

Set attempts accept an optional `durationSeconds` value between 1 and 86400. The API persists it as a `typed_metric` of type `duration` with unit `s`; the PWA exposes the field only for `technique` blocks. Migration `0009_duration_metric.sql` extends the metric and unit constraints.
