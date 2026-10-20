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

    expect(publication.sourceVersion).toBe("example-2026-10-19-v3");
    expect(publication.weeks[0]?.sessions[0]?.plannedDate).toBe("2026-10-20");
    expect(publication.weeks[0]?.sessions[0]?.blocks).toHaveLength(3);
    expect(publication.weeks[0]?.sessions[0]?.blocks[1]?.prescriptions?.[0]?.details).toEqual(
      expect.objectContaining({ oneRepMaxPercentage: 75 }),
    );
    expect(publication.weeks[0]?.sessions[0]?.blocks[1]?.prescriptions?.[0]?.details).not.toEqual(
      expect.objectContaining({ recommendedWeightKg: expect.anything() }),
    );

    const wodPrescriptions = publication.weeks[0]?.sessions[0]?.blocks[2]?.prescriptions;
    expect(wodPrescriptions).toHaveLength(3);
    expect(wodPrescriptions?.[1]).toEqual(
      expect.objectContaining({
        movementId: "back-squat-id",
        details: { repetitions: 10, recommendedWeightKg: 60 },
      }),
    );
    expect(wodPrescriptions?.[2]).toEqual(
      expect.objectContaining({
        movementId: "deadlift-id",
        details: {
          repetitions: 8,
          recommendedWeightKg: 83,
          fallbackOneRepMaxPercentage: 55,
        },
      }),
    );
  });
});
