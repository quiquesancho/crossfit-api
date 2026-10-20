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
