import { and, asc, eq, isNull } from "drizzle-orm";

import type { Database } from "./db/client.js";
import { catalog, catalogEntry, movement, movementFamily } from "./db/schema.js";

export function createCatalogReader(database: Database) {
  return {
    async listEntries(catalogKey: string) {
      return database
        .select({
          id: catalogEntry.id,
          code: catalogEntry.code,
          description: catalogEntry.description,
          displayOrder: catalogEntry.displayOrder,
        })
        .from(catalog)
        .innerJoin(catalogEntry, eq(catalogEntry.catalogId, catalog.id))
        .where(and(eq(catalog.key, catalogKey), eq(catalogEntry.active, true), isNull(catalogEntry.archivedAt)))
        .orderBy(asc(catalogEntry.displayOrder), asc(catalogEntry.code));
    },
    async listMovements() {
      return database
        .select({ code: movement.code, name: movement.name, familyCode: movementFamily.code })
        .from(movement)
        .innerJoin(movementFamily, eq(movement.familyId, movementFamily.id))
        .where(and(isNull(movement.archivedAt), isNull(movementFamily.archivedAt)))
        .orderBy(asc(movement.name));
    },
  };
}

export type CatalogReader = ReturnType<typeof createCatalogReader>;
