import { eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { movement, movementFamily } from "../../db/schema.js";
import {
  MovementCatalogConflictError,
  MovementCatalogValidationError,
  type MovementCatalogImport,
  type MovementCatalogImportCounts,
  type MovementCatalogImportResult,
  type MovementCatalogWriter,
} from "./movement-catalog.types.js";

function emptyCounts(): MovementCatalogImportCounts {
  return { created: 0, updated: 0, unchanged: 0 };
}

export function createMovementCatalogWriter(database: Database): MovementCatalogWriter {
  return {
    async importCatalog(input: MovementCatalogImport): Promise<MovementCatalogImportResult> {
      return database.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`openclaw:movement-catalog`}))`);

        const familyCodes = [
          ...new Set([
            ...input.families.map(({ code }) => code),
            ...input.movements.map(({ familyCode }) => familyCode),
          ]),
        ];
        const movementCodes = input.movements.map(({ code }) => code);

        const existingFamilies = familyCodes.length
          ? await tx
              .select({
                id: movementFamily.id,
                code: movementFamily.code,
                name: movementFamily.name,
                archivedAt: movementFamily.archivedAt,
              })
              .from(movementFamily)
              .where(inArray(movementFamily.code, familyCodes))
          : [];
        const existingFamilyByCode = new Map(existingFamilies.map((family) => [family.code, family]));

        for (const family of input.families) {
          const existing = existingFamilyByCode.get(family.code);
          if (existing?.archivedAt) {
            throw new MovementCatalogConflictError(
              "family_archived",
              `Movement family ${family.code} is archived.`,
              { familyCode: family.code },
            );
          }
        }

        for (const [index, item] of input.movements.entries()) {
          const existing = existingFamilyByCode.get(item.familyCode);
          const familyInImport = input.families.some(({ code }) => code === item.familyCode);
          if (!existing && !familyInImport) {
            throw new MovementCatalogValidationError([
              {
                path: `movements[${index}].familyCode`,
                message: `Unknown movement family ${item.familyCode}.`,
              },
            ]);
          }
          if (existing?.archivedAt) {
            throw new MovementCatalogValidationError([
              {
                path: `movements[${index}].familyCode`,
                message: `Movement family ${item.familyCode} is archived.`,
              },
            ]);
          }
        }

        const existingMovements = movementCodes.length
          ? await tx
              .select({
                id: movement.id,
                code: movement.code,
                name: movement.name,
                familyId: movement.familyId,
                familyCode: movementFamily.code,
                archivedAt: movement.archivedAt,
              })
              .from(movement)
              .innerJoin(movementFamily, eq(movement.familyId, movementFamily.id))
              .where(inArray(movement.code, movementCodes))
          : [];
        const existingMovementByCode = new Map(existingMovements.map((item) => [item.code, item]));

        for (const item of input.movements) {
          const existing = existingMovementByCode.get(item.code);
          if (existing?.archivedAt) {
            throw new MovementCatalogConflictError(
              "movement_archived",
              `Movement ${item.code} is archived.`,
              { movementCode: item.code },
            );
          }
          if (existing && existing.familyCode !== item.familyCode) {
            throw new MovementCatalogConflictError(
              "movement_family_conflict",
              `Movement ${item.code} already belongs to family ${existing.familyCode}.`,
              {
                movementCode: item.code,
                currentFamilyCode: existing.familyCode,
                requestedFamilyCode: item.familyCode,
              },
            );
          }
        }

        const familyCounts = emptyCounts();
        for (const family of input.families) {
          const existing = existingFamilyByCode.get(family.code);
          if (!existing) {
            familyCounts.created += 1;
          } else if (existing.name === family.name) {
            familyCounts.unchanged += 1;
          } else {
            familyCounts.updated += 1;
          }
        }

        const movementCounts = emptyCounts();
        for (const item of input.movements) {
          const existing = existingMovementByCode.get(item.code);
          if (!existing) {
            movementCounts.created += 1;
          } else if (existing.name === item.name) {
            movementCounts.unchanged += 1;
          } else {
            movementCounts.updated += 1;
          }
        }

        const familyIdByCode = new Map(existingFamilies.map((family) => [family.code, family.id]));
        if (input.families.length > 0) {
          const upsertedFamilies = await tx
            .insert(movementFamily)
            .values(input.families.map(({ code, name }) => ({ code, name })))
            .onConflictDoUpdate({
              target: movementFamily.code,
              set: { name: sql`excluded.name` },
            })
            .returning({ id: movementFamily.id, code: movementFamily.code });
          for (const family of upsertedFamilies) {
            familyIdByCode.set(family.code, family.id);
          }
        }

        if (input.movements.length > 0) {
          const movementValues = input.movements.map((item) => {
            const familyId = familyIdByCode.get(item.familyCode);
            if (!familyId) {
              throw new Error(`Movement family ${item.familyCode} was not resolved.`);
            }
            return { code: item.code, name: item.name, familyId };
          });
          await tx
            .insert(movement)
            .values(movementValues)
            .onConflictDoUpdate({
              target: movement.code,
              set: {
                name: sql`excluded.name`,
                familyId: sql`excluded.family_id`,
              },
            });
        }

        return { status: "applied", families: familyCounts, movements: movementCounts };
      });
    },
  };
}
