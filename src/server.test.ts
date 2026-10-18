import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const app = buildApp();

afterAll(async () => app.close());

describe("health endpoint", () => {
  it("returns an operational status", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("catalog endpoints", () => {
  const catalogReader = {
    listEntries: async () => [{ id: "catalog-entry-id", code: "warmup", description: "Warm-up", displayOrder: 1 }],
    listMovements: async () => [{ code: "power-clean", name: "Power clean", familyCode: "clean" }],
  };
  const catalogApp = buildApp({ catalogReader });

  afterAll(async () => catalogApp.close());

  it("lists active catalog entries", async () => {
    const response = await catalogApp.inject({ method: "GET", url: "/api/v1/catalogs/block-type" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ entries: await catalogReader.listEntries() });
  });

  it("lists active movements", async () => {
    const response = await catalogApp.inject({ method: "GET", url: "/api/v1/catalog/movements" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ movements: await catalogReader.listMovements() });
  });
});
