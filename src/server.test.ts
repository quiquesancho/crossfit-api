import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createCatalogReader } from "./modules/catalog/catalog.repository.js";
import type { Database } from "./db/client.js";

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

describe("catalog reader", () => {
  it("maps catalog entries from the database query", async () => {
    const rows = [{ id: "catalog-entry-id", code: "warmup", description: "Warm-up", displayOrder: 1 }];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      orderBy: async () => rows,
    };
    const reader = createCatalogReader({ select: () => query } as unknown as Database);

    await expect(reader.listEntries("block-type")).resolves.toEqual(rows);
  });

  it("maps movements from the database query", async () => {
    const rows = [{ code: "power-clean", name: "Power clean", familyCode: "clean" }];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      orderBy: async () => rows,
    };
    const reader = createCatalogReader({ select: () => query } as unknown as Database);

    await expect(reader.listMovements()).resolves.toEqual(rows);
  });
});
