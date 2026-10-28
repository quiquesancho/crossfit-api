import { sql } from "drizzle-orm";

import { createDatabase } from "./client.js";
import { athlete, catalog, catalogEntry } from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set to bootstrap the database.");
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
    throw new Error(`Failed to bootstrap the ${catalogSeed.key} catalog.`);
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

// Movement families and movements are data managed through the OpenClaw
// integration API. Complexes remain read-only and are not seeded either.
