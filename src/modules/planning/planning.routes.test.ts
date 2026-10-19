import { afterAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import { hashPlanningPublication } from "./planning.hash.js";
import {
  LocalAthleteNotFoundError,
  PlanningValidationError,
  PlanningVersionConflictError,
  type PlanningPublication,
} from "./planning.types.js";
import { validatePlanningPublication } from "./planning.validation.js";

const publication: PlanningPublication = {
  sourceVersion: "2026-W43-v1",
  title: "Semana de fuerza y engine",
  weeks: [
    {
      weekStart: "2026-10-19",
      sessions: [
        {
          externalId: "session-1",
          plannedDate: "2026-10-20",
          title: "Fuerza y WOD",
          blocks: [
            {
              blockTypeId: "019b4e0a-0000-7000-8000-000000000003",
              title: "Fuerza",
              prescriptions: [
                {
                  movementId: "019b4e0a-0000-7000-8000-000000000010",
                  details: { sets: 4, repetitions: 4 },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("planning publication validation", () => {
  it("accepts a complete publication", () => {
    expect(validatePlanningPublication(publication)).toEqual({ valid: true, publication });
  });

  it("rejects conflicting prescription references", () => {
    const invalid = structuredClone(publication);
    invalid.weeks[0]!.sessions[0]!.blocks[0]!.prescriptions![0]!.complexVersionId =
      "019b4e0a-0000-7000-8000-000000000020";

    const result = validatePlanningPublication(invalid);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "weeks[0].sessions[0].blocks[0].prescriptions[0]" }),
        ]),
      );
    }
  });

  it("rejects duplicate session identifiers", () => {
    const invalid = structuredClone(publication);
    invalid.weeks[0]!.sessions.push(structuredClone(invalid.weeks[0]!.sessions[0]!));

    const result = validatePlanningPublication(invalid);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: "weeks[0].sessions[1].externalId" }),
      );
    }
  });

  it("hashes equivalent objects independently of property order", () => {
    const reordered = { weeks: publication.weeks, title: publication.title, sourceVersion: publication.sourceVersion };
    expect(hashPlanningPublication(reordered)).toBe(hashPlanningPublication(publication));
  });
});

describe("planning publication route", () => {
  const publish = vi.fn();
  const app = buildApp({ planningPublisher: { publish }, openClawServiceKey: "test-secret" });
  afterAll(async () => app.close());

  it("requires the service credential", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/training-plans/plan-1",
      payload: publication,
    });

    expect(response.statusCode).toBe(401);
    expect(publish).not.toHaveBeenCalled();
  });

  it("returns structured contract validation errors", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/training-plans/plan-1",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload: { ...publication, weeks: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "validation_error",
      message: "Contract validation failed.",
      issues: [{ path: "weeks", message: "Must contain at least one week." }],
    });
  });

  it("publishes a new version", async () => {
    publish.mockResolvedValueOnce({
      trainingPlanId: "019b4e0a-0000-7000-8000-000000000030",
      planVersionId: "019b4e0a-0000-7000-8000-000000000031",
      status: "published",
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/training-plans/plan-1",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload: publication,
    });

    expect(response.statusCode).toBe(201);
    expect(publish).toHaveBeenCalledWith("plan-1", publication);
    expect(response.json()).toEqual(expect.objectContaining({ status: "published" }));
  });

  it("returns an existing equivalent version", async () => {
    publish.mockResolvedValueOnce({
      trainingPlanId: "019b4e0a-0000-7000-8000-000000000030",
      planVersionId: "019b4e0a-0000-7000-8000-000000000031",
      status: "unchanged",
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/training-plans/plan-1",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload: publication,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({ status: "unchanged" }));
  });

  it.each([
    [new PlanningVersionConflictError(), 409, "source_version_conflict"],
    [new LocalAthleteNotFoundError(), 503, "local_athlete_unavailable"],
    [new PlanningValidationError([{ path: "weeks[0]", message: "Unknown reference." }]), 400, "validation_error"],
  ])("maps domain errors", async (error, status, code) => {
    publish.mockRejectedValueOnce(error);

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/training-plans/plan-1",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload: publication,
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual(expect.objectContaining({ code }));
  });
});
