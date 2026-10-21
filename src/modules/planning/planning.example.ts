import type { PlanningPublication } from "./planning.types.js";

type ExampleReferences = {
  warmupBlockTypeId: string;
  strengthBlockTypeId: string;
  wodBlockTypeId: string;
  powerCleanMovementId: string;
  backSquatMovementId: string;
  deadliftMovementId: string;
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
    sourceVersion: `example-${weekStart}-v6`,
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
                    details: {
                      sets: 5,
                      repetitions: 3,
                      oneRepMaxPercentage: 75,
                      weightUnit: "kg",
                    },
                    notes: "Carga técnica estable. Descansar 90 segundos entre series.",
                  },
                ],
              },
              {
                blockTypeId: references.wodBlockTypeId,
                title: "AMRAP 12 minutos",
                instructions: "Mantener un ritmo que permita completar todas las rondas sin pausas largas.",
                durationSeconds: 720,
                targetRpe: 8,
                prescriptions: [
                  { details: { format: "amrap", durationSeconds: 720 } },
                  {
                    movementId: references.backSquatMovementId,
                    details: { repetitions: 10, prescribedWeight: { amount: 60, unit: "kg" } },
                    notes: "Peso obligatorio: 60 kg.",
                  },
                  {
                    movementId: references.deadliftMovementId,
                    details: {
                      repetitions: 8,
                      prescribedWeight: { amount: 83, unit: "kg" },
                    },
                    notes: "Si no puedes con 83 kg, usa tu 55 % de 1RM.",
                  },
                ],
              },
            ],
          },
          {
            externalId: `example-${weekStart}-session-2`,
            plannedDate: addDays(weekStart, 2),
            title: "Formatos de WOD",
            objective: "Practicar EMOM, For Time y Rounds For Time con cargas controladas.",
            durationSeconds: 3600,
            targetRpe: 8,
            blocks: [
              {
                blockTypeId: references.warmupBlockTypeId,
                title: "Calentamiento",
                instructions: "Movilidad y activación general.",
                durationSeconds: 600,
              },
              {
                blockTypeId: references.wodBlockTypeId,
                title: "EMOM 10 minutos",
                instructions: "Al inicio de cada minuto, completa 5 power cleans.",
                durationSeconds: 600,
                targetRpe: 7,
                prescriptions: [
                  { details: { format: "emom", intervalSeconds: 60, durationSeconds: 600 } },
                  {
                    movementId: references.powerCleanMovementId,
                    details: { repetitions: 5, prescribedWeight: { amount: 50, unit: "kg" } },
                    notes: "Carga ligera para mantener la técnica durante todo el EMOM.",
                  },
                ],
              },
              {
                blockTypeId: references.wodBlockTypeId,
                title: "For Time con cap de 15 minutos",
                instructions: "Completa 30 back squats lo antes posible, sin superar el cap.",
                durationSeconds: 900,
                targetRpe: 8,
                prescriptions: [
                  { details: { format: "for_time", timeCapSeconds: 900 } },
                  {
                    movementId: references.backSquatMovementId,
                    details: { repetitions: 30, prescribedWeight: { amount: 60, unit: "kg" } },
                    notes: "Peso obligatorio: 60 kg.",
                  },
                ],
              },
              {
                blockTypeId: references.wodBlockTypeId,
                title: "Rounds For Time: 5 rondas",
                instructions: "Cinco rondas de 10 deadlifts, con cap de 20 minutos.",
                durationSeconds: 1200,
                targetRpe: 8,
                prescriptions: [
                  { details: { format: "rounds_for_time", rounds: 5, timeCapSeconds: 1200 } },
                  {
                    movementId: references.deadliftMovementId,
                    details: { repetitions: 10, prescribedWeight: { amount: 83, unit: "kg" } },
                    notes: "Si no puedes con 83 kg, usa tu 55 % de 1RM.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
