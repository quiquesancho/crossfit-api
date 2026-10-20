import { describe, expect, it } from "vitest";

import { createExamplePlanningPublication, currentWeekStart } from "./planning.example.js";

describe("example planning", () => {
  it("calculates Monday in the athlete timezone", () => {
    expect(currentWeekStart(new Date("2026-10-18T23:30:00Z"), "Europe/Madrid")).toBe("2026-10-19");
  });

  it("creates a stable publication from catalog references", () => {
    const publication = createExamplePlanningPublication("2026-10-19", {
      warmupBlockTypeId: "warmup-id",
      strengthBlockTypeId: "strength-id",
      wodBlockTypeId: "wod-id",
      powerCleanMovementId: "power-clean-id",
      backSquatMovementId: "back-squat-id",
      deadliftMovementId: "deadlift-id",
    });

    expect(publication.sourceVersion).toBe("example-2026-10-19-v5");
    expect(publication.weeks[0]?.sessions[0]?.plannedDate).toBe("2026-10-20");
    expect(publication.weeks[0]?.sessions[0]?.blocks).toHaveLength(3);
    const strengthPrescription = publication.weeks[0]?.sessions[0]?.blocks[1]?.prescriptions?.[0];
    expect(strengthPrescription?.details).toEqual(
      expect.objectContaining({ oneRepMaxPercentage: 75 }),
    );
    expect(strengthPrescription?.details).not.toEqual(
      expect.objectContaining({ prescribedWeightKg: expect.anything() }),
    );
    expect(strengthPrescription?.details).not.toEqual(
      expect.objectContaining({ loadGuidance: expect.anything() }),
    );
    expect(strengthPrescription?.notes).toContain("Carga técnica estable");

    const wodPrescriptions = publication.weeks[0]?.sessions[0]?.blocks[2]?.prescriptions;
    expect(wodPrescriptions).toHaveLength(3);
    expect(wodPrescriptions?.[0]?.details).toEqual({
      format: "amrap",
      durationSeconds: 720,
    });
    expect(wodPrescriptions?.[1]).toEqual(
      expect.objectContaining({
        movementId: "back-squat-id",
        details: { repetitions: 10, prescribedWeightKg: 60 },
      }),
    );
    expect(wodPrescriptions?.[2]).toEqual(
      expect.objectContaining({
        movementId: "deadlift-id",
        details: {
          repetitions: 8,
          prescribedWeightKg: 83,
        },
        notes: "Si no puedes con 83 kg, usa tu 55 % de 1RM.",
      }),
    );

    const formatSession = publication.weeks[0]?.sessions[1];
    expect(formatSession?.plannedDate).toBe("2026-10-21");
    expect(formatSession?.blocks).toHaveLength(4);
    expect(formatSession?.blocks[1]?.prescriptions?.[0]?.details).toEqual({
      format: "emom",
      intervalSeconds: 60,
      durationSeconds: 600,
    });
    expect(formatSession?.blocks[2]?.prescriptions?.[0]?.details).toEqual({
      format: "for_time",
      timeCapSeconds: 900,
    });
    expect(formatSession?.blocks[3]?.prescriptions?.[0]?.details).toEqual({
      format: "rounds_for_time",
      rounds: 5,
      timeCapSeconds: 1200,
    });
  });
});
