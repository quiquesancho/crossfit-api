# CrossFit API

Fastify backend and the single OpenAPI contract for the CrossFit training application.

## Structure

- `openapi.yaml`: versioned HTTP contract; update it with every public API change.
- `src/config`: environment configuration and application settings.
- `src/db`: Drizzle client, schema and seed scripts.
- `src/modules`: domain modules, each owning its routes and persistence access.
- `drizzle`: generated SQL migrations; do not edit generated metadata manually.
