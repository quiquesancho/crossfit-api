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
  paths: Record<
    string,
    Record<
      string,
      {
        requestBody?: { content?: Record<string, { schema?: object }> };
        responses: Record<string, { content?: Record<string, { schema?: object }> }>;
      }
    >
  >;
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

function requestValidator(path: string, method: string): ValidateFunction {
  const schema = contract.paths[path]?.[method]?.requestBody?.content?.["application/json"]?.schema;
  if (!schema) throw new Error(`Contract has no JSON schema for ${method.toUpperCase()} ${path}`);
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

const planningPublisher = {
  publish: async () => ({
    trainingPlanId: "019b4e0a-0000-7000-8000-000000000030",
    planVersionId: "019b4e0a-0000-7000-8000-000000000031",
    status: "published" as const,
  }),
};

const planningPublication = {
  sourceVersion: "2026-W43-v1",
  title: "Semana de prueba",
  weeks: [
    {
      weekStart: "2026-10-19",
      sessions: [
        {
          externalId: "session-1",
          plannedDate: "2026-10-20",
          title: "Sesión de prueba",
          blocks: [
            {
              blockTypeId: "019b4e0a-0000-7000-8000-000000000003",
              title: "Fuerza",
            },
          ],
        },
      ],
    },
  ],
};

const planningWeekReader = {
  getWeek: async () => ({
    id: "019b4e0a-0000-7000-8000-000000000040",
    trainingPlanId: "019b4e0a-0000-7000-8000-000000000030",
    planVersionId: "019b4e0a-0000-7000-8000-000000000031",
    planTitle: "Semana de prueba",
    weekStart: "2026-10-19",
    title: "Semana 1",
    priorities: "Fuerza y acondicionamiento",
    sessions: [
      {
        id: "019b4e0a-0000-7000-8000-000000000041",
        externalId: "session-1",
        plannedDate: "2026-10-20",
        title: "Fuerza y WOD",
        objective: "Mantener una técnica sólida.",
        durationSeconds: 3600,
        targetRpe: 7,
        blocks: [
          {
            id: "019b4e0a-0000-7000-8000-000000000042",
            position: 1,
            blockType: {
              id: "019b4e0a-0000-7000-8000-000000000003",
              code: "strength",
              description: "Fuerza",
            },
            title: "Power clean",
            instructions: null,
            durationSeconds: 1200,
            targetRpe: 7,
            prescriptions: [
              {
                id: "019b4e0a-0000-7000-8000-000000000043",
                position: 1,
                movement: {
                  id: "019b4e0a-0000-7000-8000-000000000010",
                  code: "power-clean",
                  name: "Power clean",
                },
                complex: null,
                details: { sets: 5, repetitions: 3 },
                notes: "Descansar 90 segundos.",
              },
            ],
          },
        ],
      },
    ],
  }),
};

const executionId = "019b4e0a-0000-7000-8000-000000000101";
const executionSnapshot = {
  baseRevision: 0,
  plannedSessionId: "019b4e0a-0000-7000-8000-000000000041",
  executionDate: "2026-10-20",
  status: "draft" as const,
  generalNote: "Primera sesión",
  blocks: [
    {
      id: "019b4e0a-0000-7000-8000-000000000102",
      plannedBlockId: "019b4e0a-0000-7000-8000-000000000042",
      position: 1,
      blockTypeId: "019b4e0a-0000-7000-8000-000000000003",
      title: "Fuerza",
      status: "completed_without_metric" as const,
      notes: "Realizado sin anotar la carga.",
    },
  ],
};
const sessionExecutionWriter = {
  synchronize: async () => ({
    id: executionId,
    revision: 1,
    status: "draft" as const,
    updatedAt: "2026-10-20T13:00:00.000Z",
    result: "persisted" as const,
  }),
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

describe("planning responses conform to the contract", () => {
  const app = buildApp({ planningPublisher, planningWeekReader, openClawServiceKey: "test-secret" });
  afterAll(async () => app.close());

  it("GET /planning/weeks/{weekStart}", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/planning/weeks/2026-10-19" });

    expect(response.statusCode).toBe(200);
    expectValid(responseValidator("/planning/weeks/{weekStart}", "get", 200), response.json());
  });

  it("PUT /integrations/openclaw/training-plans/{externalPlanId}", async () => {
    expectValid(
      requestValidator("/integrations/openclaw/training-plans/{externalPlanId}", "put"),
      planningPublication,
    );
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/training-plans/plan-1",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload: planningPublication,
    });

    expect(response.statusCode).toBe(201);
    expectValid(
      responseValidator("/integrations/openclaw/training-plans/{externalPlanId}", "put", 201),
      response.json(),
    );
  });
});

describe("execution synchronization conforms to the contract", () => {
  const app = buildApp({ sessionExecutionWriter });
  afterAll(async () => app.close());

  it("PUT /session-executions/{executionId}", async () => {
    expectValid(requestValidator("/session-executions/{executionId}", "put"), executionSnapshot);
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/session-executions/${executionId}`,
      payload: executionSnapshot,
    });

    expect(response.statusCode).toBe(200);
    expectValid(responseValidator("/session-executions/{executionId}", "put", 200), response.json());
  });
});
