import { afterAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import {
  MovementCatalogConflictError,
  MovementCatalogValidationError,
  type MovementCatalogWriter,
} from "./movement-catalog.types.js";

const payload = {
  families: [{ code: "clean", name: "Clean" }],
  movements: [{ code: "power-clean", name: "Power clean", familyCode: "clean" }],
};

describe("movement catalog import route", () => {
  const importCatalog = vi.fn();
  const writer: MovementCatalogWriter = { importCatalog };
  const app = buildApp({ movementCatalogWriter: writer, openClawServiceKey: "test-secret" });
  afterAll(async () => app.close());

  it("requires the service credential", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/movement-catalog",
      payload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthorized" });
  });

  it("rejects an invalid payload", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/movement-catalog",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload: { movements: [{ code: "Power Clean", name: "Power clean", familyCode: "clean" }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_error",
      issues: [expect.objectContaining({ path: "movements[0].code" })],
    });
  });

  it("applies a valid import", async () => {
    importCatalog.mockResolvedValueOnce({
      status: "applied",
      families: { created: 1, updated: 0, unchanged: 0 },
      movements: { created: 1, updated: 0, unchanged: 0 },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/movement-catalog",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "applied",
      families: { created: 1, updated: 0, unchanged: 0 },
      movements: { created: 1, updated: 0, unchanged: 0 },
    });
    expect(importCatalog).toHaveBeenCalledWith(payload);
  });

  it("returns a conflict when a movement changes family", async () => {
    importCatalog.mockRejectedValueOnce(
      new MovementCatalogConflictError(
        "movement_family_conflict",
        "Movement power-clean already belongs to family clean.",
        {
          movementCode: "power-clean",
          currentFamilyCode: "clean",
          requestedFamilyCode: "snatch",
        },
      ),
    );

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/movement-catalog",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "movement_family_conflict",
      details: { movementCode: "power-clean" },
    });
  });

  it("maps writer validation errors to 400", async () => {
    importCatalog.mockRejectedValueOnce(
      new MovementCatalogValidationError([
        { path: "movements[0].familyCode", message: "Unknown movement family snatch." },
      ]),
    );

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/movement-catalog",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_error",
      issues: [expect.objectContaining({ path: "movements[0].familyCode" })],
    });
  });

  it("returns 503 when the writer or key is unavailable", async () => {
    const unavailable = buildApp({ openClawServiceKey: "test-secret" });
    const response = await unavailable.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/movement-catalog",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload,
    });
    await unavailable.close();

    expect(response.statusCode).toBe(503);
  });
});
