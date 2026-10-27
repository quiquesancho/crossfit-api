import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import {
  catalog,
  catalogEntry,
  complex,
  complexStep,
  complexVersion,
  movement,
  movementFamily,
} from "../../db/schema.js";

export type ComplexCatalogEntry = {
  id: string;
  code: string;
  name: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    publishedAt: string | null;
    steps: Array<{
      position: number;
      repetitions: number;
      movement: { id: string; code: string; name: string };
    }>;
  }>;
};

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
        .select({ id: movement.id, code: movement.code, name: movement.name, familyCode: movementFamily.code })
        .from(movement)
        .innerJoin(movementFamily, eq(movement.familyId, movementFamily.id))
        .where(and(isNull(movement.archivedAt), isNull(movementFamily.archivedAt)))
        .orderBy(asc(movement.name));
    },
    async listComplexes(): Promise<ComplexCatalogEntry[]> {
      const rows = await database
        .select({
          complexId: complex.id,
          complexCode: complex.code,
          complexName: complex.name,
          versionId: complexVersion.id,
          versionNumber: complexVersion.versionNumber,
          publishedAt: complexVersion.publishedAt,
          position: complexStep.position,
          repetitions: complexStep.repetitions,
          movementId: movement.id,
          movementCode: movement.code,
          movementName: movement.name,
        })
        .from(complex)
        .innerJoin(
          complexVersion,
          and(
            eq(complexVersion.complexId, complex.id),
            eq(complexVersion.status, "published"),
          ),
        )
        .innerJoin(complexStep, eq(complexStep.complexVersionId, complexVersion.id))
        .innerJoin(movement, eq(complexStep.movementId, movement.id))
        .where(isNull(complex.archivedAt))
        .orderBy(
          asc(complex.name),
          desc(complexVersion.versionNumber),
          asc(complexStep.position),
        );

      const complexes = new Map<string, ComplexCatalogEntry>();
      const versions = new Map<string, ComplexCatalogEntry["versions"][number]>();
      for (const row of rows) {
        let entry = complexes.get(row.complexId);
        if (!entry) {
          entry = {
            id: row.complexId,
            code: row.complexCode,
            name: row.complexName,
            versions: [],
          };
          complexes.set(row.complexId, entry);
        }
        let version = versions.get(row.versionId);
        if (!version) {
          version = {
            id: row.versionId,
            versionNumber: row.versionNumber,
            publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
            steps: [],
          };
          versions.set(row.versionId, version);
          entry.versions.push(version);
        }
        version.steps.push({
          position: row.position,
          repetitions: row.repetitions,
          movement: { id: row.movementId, code: row.movementCode, name: row.movementName },
        });
      }

      return [...complexes.values()];
    },
  };
}

export type CatalogReader = ReturnType<typeof createCatalogReader>;
