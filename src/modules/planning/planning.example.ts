import type { PlanningPublication } from "./planning.types.js";

type ExampleReferences = {
  warmupBlockTypeId: string;
  strengthBlockTypeId: string;
  wodBlockTypeId: string;
  powerCleanMovementId: string;
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function currentWeekStart(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const localDate = `${part("year")}-${part("month")}-${part("day")}`;
  const date = new Date(`${localDate}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export function createExamplePlanningPublication(
  weekStart: string,
  references: ExampleReferences,
): PlanningPublication {
  return {
    sourceVersion: `example-${weekStart}-v1`,
    title: "Planificación de ejemplo",
    weeks: [
      {
        weekStart,
        title: "Semana de fuerza y acondicionamiento",
        priorities: "Técnica de power clean, fuerza y ritmo sostenible",
        sessions: [
          {
            externalId: `example-${weekStart}-session-1`,
            plannedDate: addDays(weekStart, 1),
            title: "Power clean y AMRAP",
            objective: "Trabajar posiciones sólidas y mantener un ritmo constante.",
            durationSeconds: 3600,
            targetRpe: 7,
            blocks: [
              {
                blockTypeId: references.warmupBlockTypeId,
                title: "Calentamiento",
                instructions: "Movilidad, activación y progresión técnica con barra vacía.",
                durationSeconds: 600,
              },
              {
                blockTypeId: references.strengthBlockTypeId,
                title: "Power clean",
                durationSeconds: 1200,
                targetRpe: 7,
                prescriptions: [
                  {
                    movementId: references.powerCleanMovementId,
                    details: { sets: 5, repetitions: 3, loadGuidance: "Carga técnica estable" },
                    notes: "Descansar 90 segundos entre series.",
                  },
                ],
              },
              {
                blockTypeId: references.wodBlockTypeId,
                title: "AMRAP 12 minutos",
                instructions: "Mantener un ritmo que permita completar todas las rondas sin pausas largas.",
                durationSeconds: 720,
                targetRpe: 8,
                prescriptions: [{ details: { format: "amrap", durationSeconds: 720 } }],
              },
            ],
          },
        ],
      },
    ],
  };
}
