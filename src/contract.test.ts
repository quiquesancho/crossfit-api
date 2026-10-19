import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { parse } from "yaml";
import { afterAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

const CONTRACT_ID = "urn:crossfit:openapi";

const contract = parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../openapi.yaml"), "utf8"),
) as {
  openapi: string;
  paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema?: object }> }> }>>;
  components: object;
};

const ajv = new Ajv2020({ strict: false, validateSchema: false, allErrors: true });
ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
ajv.addFormat("date", /^\d{4}-\d{2}-\d{2}$/);
ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
ajv.addSchema({ $id: CONTRACT_ID, components: contract.components });

function absolutizeRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(absolutizeRefs);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        key === "$ref" && typeof value === "string" && value.startsWith("#/")
          ? `${CONTRACT_ID}${value}`
          : absolutizeRefs(value),
      ]),
    );
  }
  return node;
}

function responseValidator(path: string, method: string, status: number): ValidateFunction {
  const schema = contract.paths[path]?.[method]?.responses[String(status)]?.content?.["application/json"]?.schema;
  if (!schema) throw new Error(`Contract has no JSON schema for ${method.toUpperCase()} ${path} ${status}`);
  return ajv.compile(absolutizeRefs(schema) as object);
}

function expectValid(validate: ValidateFunction, payload: unknown) {
  const valid = validate(payload);
  expect(validate.errors ?? []).toEqual([]);
  expect(valid).toBe(true);
}

const catalogReader = {
  listEntries: async () => [
    { id: "019b4e0a-0000-7000-8000-000000000002", code: "warmup", description: "Warm-up", displayOrder: 1 },
  ],
  listMovements: async () => [
    { id: "019b4e0a-0000-7000-8000-000000000010", code: "power-clean", name: "Power clean", familyCode: "clean" },
  ],
};

describe("openapi contract document", () => {
  it("declares the version and the implemented paths", () => {
    expect(contract.openapi).toBe("3.1.0");
    expect(Object.keys(contract.paths)).toEqual(
      expect.arrayContaining(["/catalogs/{catalogKey}", "/catalog/movements"]),
    );
  });
});

describe("catalog responses conform to the contract", () => {
  const app = buildApp({ catalogReader });
  afterAll(async () => app.close());

  it("GET /catalogs/{catalogKey}", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/catalogs/block-type" });

    expect(response.statusCode).toBe(200);
    expectValid(responseValidator("/catalogs/{catalogKey}", "get", 200), response.json());
  });

  it("GET /catalog/movements", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/catalog/movements" });

    expect(response.statusCode).toBe(200);
    expectValid(responseValidator("/catalog/movements", "get", 200), response.json());
  });
});
