import { sql } from "drizzle-orm";

import { createDatabase } from "./client.js";
import {
  athlete,
  catalog,
  catalogEntry,
  complex,
  complexStep,
  complexVersion,
  movement,
  movementFamily,
} from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set to seed the database.");
}

const database = createDatabase(connectionString);
const athleteDisplayName = (process.env.ATHLETE_DISPLAY_NAME ?? "Atleta").trim();
const athleteTimezone = (process.env.ATHLETE_TIMEZONE ?? "Europe/Madrid").trim();

if (!athleteDisplayName || !athleteTimezone) {
  throw new Error("ATHLETE_DISPLAY_NAME and ATHLETE_TIMEZONE cannot be empty.");
}

await database
  .insert(athlete)
  .values({ profileKey: "local", displayName: athleteDisplayName, timezone: athleteTimezone })
  .onConflictDoUpdate({
    target: athlete.profileKey,
    set: {
      displayName: sql`excluded.display_name`,
      timezone: sql`excluded.timezone`,
      active: true,
      updatedAt: sql`now()`,
    },
  });

type CatalogSeed = {
  key: string;
  description: string;
  entries: Array<{ code: string; description: string }>;
};

const catalogs: CatalogSeed[] = [
  {
    key: "block-type",
    description: "Tipos de bloque de entrenamiento",
    entries: [
      { code: "warmup", description: "Calentamiento" },
      { code: "technique", description: "Técnica" },
      { code: "strength", description: "Fuerza" },
      { code: "wod", description: "WOD" },
    ],
  },
  {
    key: "recovery",
    description: "Recuperación percibida",
    entries: [
      { code: "very-poor", description: "Muy mala" },
      { code: "poor", description: "Mala" },
      { code: "normal", description: "Normal" },
      { code: "good", description: "Buena" },
      { code: "very-good", description: "Muy buena" },
    ],
  },
  {
    key: "technique-quality",
    description: "Calidad técnica percibida",
    entries: [
      { code: "poor", description: "Deficiente" },
      { code: "acceptable", description: "Aceptable" },
      { code: "good", description: "Buena" },
      { code: "excellent", description: "Excelente" },
    ],
  },
  {
    key: "limitation",
    description: "Limitante principal del entrenamiento",
    entries: [
      { code: "technique", description: "Técnica" },
      { code: "cardiorespiratory", description: "Cardiorrespiratoria" },
      { code: "local-muscular", description: "Muscular local" },
      { code: "pain", description: "Dolor" },
      { code: "time", description: "Tiempo" },
      { code: "other", description: "Otro" },
    ],
  },
  {
    key: "substitution-reason",
    description: "Motivos de sustitución de movimientos",
    entries: [
      { code: "pain", description: "Dolor o molestia" },
      { code: "equipment", description: "Material no disponible" },
      { code: "technique", description: "Limitación técnica" },
      { code: "time", description: "Falta de tiempo" },
      { code: "other", description: "Otro" },
    ],
  },
];

for (const catalogSeed of catalogs) {
  const [seededCatalog] = await database
    .insert(catalog)
    .values({ key: catalogSeed.key, description: catalogSeed.description })
    .onConflictDoUpdate({
      target: catalog.key,
      set: { description: sql`excluded.description` },
    })
    .returning({ id: catalog.id });

  if (!seededCatalog) {
    throw new Error(`Failed to seed the ${catalogSeed.key} catalog.`);
  }

  await database
    .insert(catalogEntry)
    .values(
      catalogSeed.entries.map((entry, index) => ({
        catalogId: seededCatalog.id,
        code: entry.code,
        description: entry.description,
        displayOrder: index + 1,
      })),
    )
    .onConflictDoUpdate({
      target: [catalogEntry.catalogId, catalogEntry.code],
      set: {
        description: sql`excluded.description`,
        displayOrder: sql`excluded.display_order`,
      },
    });
}

const [clean] = await database
  .insert(movementFamily)
  .values({ code: "clean", name: "Clean" })
  .onConflictDoUpdate({ target: movementFamily.code, set: { name: sql`excluded.name` } })
  .returning({ id: movementFamily.id });

if (!clean) {
  throw new Error("Failed to seed the clean movement family.");
}

const [squat] = await database
  .insert(movementFamily)
  .values({ code: "squat", name: "Squat" })
  .onConflictDoUpdate({ target: movementFamily.code, set: { name: sql`excluded.name` } })
  .returning({ id: movementFamily.id });

if (!squat) {
  throw new Error("Failed to seed the squat movement family.");
}

const [powerClean] = await database
  .insert(movement)
  .values({ code: "power-clean", familyId: clean.id, name: "Power clean" })
  .onConflictDoUpdate({
    target: movement.code,
    set: { name: sql`excluded.name`, familyId: sql`excluded.family_id` },
  })
  .returning({ id: movement.id });

const [frontSquat] = await database
  .insert(movement)
  .values({ code: "front-squat", familyId: squat.id, name: "Front squat" })
  .onConflictDoUpdate({
    target: movement.code,
    set: { name: sql`excluded.name`, familyId: sql`excluded.family_id` },
  })
  .returning({ id: movement.id });

if (!powerClean || !frontSquat) {
  throw new Error("Failed to seed the example movements.");
}

const [cleanComplex] = await database
  .insert(complex)
  .values({ code: "clean-complex", name: "Clean complex" })
  .onConflictDoUpdate({ target: complex.code, set: { name: sql`excluded.name` } })
  .returning({ id: complex.id });

if (!cleanComplex) {
  throw new Error("Failed to seed the clean complex.");
}

const [cleanComplexVersion] = await database
  .insert(complexVersion)
  .values({
    complexId: cleanComplex.id,
    versionNumber: 1,
    status: "published",
    publishedAt: sql`now()`,
  })
  .onConflictDoUpdate({
    target: [complexVersion.complexId, complexVersion.versionNumber],
    set: {
      status: "published",
      publishedAt: sql`coalesce(complex_version.published_at, now())`,
    },
  })
  .returning({ id: complexVersion.id });

if (!cleanComplexVersion) {
  throw new Error("Failed to seed the clean complex version.");
}

await database
  .insert(complexStep)
  .values([
    {
      complexVersionId: cleanComplexVersion.id,
      position: 1,
      movementId: powerClean.id,
      repetitions: 1,
    },
    {
      complexVersionId: cleanComplexVersion.id,
      position: 2,
      movementId: frontSquat.id,
      repetitions: 1,
    },
  ])
  .onConflictDoUpdate({
    target: [complexStep.complexVersionId, complexStep.position],
    set: {
      movementId: sql`excluded.movement_id`,
      repetitions: sql`excluded.repetitions`,
    },
  });
