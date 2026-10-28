import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { parse } from "yaml";
import { afterAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import type {
  PersonalRecordReader,
  PersonalRecordWriter,
} from "./modules/personal-records/personal-records.types.js";
import type { ProgressReader } from "./modules/progress/progress.types.js";

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
  listMovementFamilies: async () => [
    { id: "019b4e0a-0000-7000-8000-000000000009", code: "clean", name: "Clean" },
  ],
  listComplexes: async () => [
    {
      id: "019b4e0a-0000-7000-8000-000000000020",
      code: "clean-complex",
      name: "Clean complex",
      versions: [
        {
          id: "019b4e0a-0000-7000-8000-000000000021",
          versionNumber: 1,
          publishedAt: "2026-10-18T12:00:00.000Z",
          steps: [
            {
              position: 1,
              repetitions: 1,
              movement: {
                id: "019b4e0a-0000-7000-8000-000000000010",
                code: "power-clean",
                name: "Power clean",
              },
            },
          ],
        },
      ],
    },
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
                allowsActualWeight: false,
                notes: "Descansar 90 segundos.",
              },
            ],
          },
        ],
      },
    ],
  }),
};

const executionHistoryReader = {
  listExecutions: async () => ({
    items: [
      {
        id: "019b4e0a-0000-7000-8000-000000000101",
        executionDate: "2026-10-20",
        status: "completed" as const,
        origin: "planned" as const,
        title: "Fuerza y WOD",
        plannedSessionId: "019b4e0a-0000-7000-8000-000000000041",
        blockCount: 2,
        rpe: 8,
        revision: 2,
        updatedAt: "2026-10-20T13:00:00.000Z",
      },
    ],
    nextCursor: null,
  }),
  getCalendar: async () => ({
    days: [
      {
        date: "2026-10-20",
        planned: [
          {
            id: "019b4e0a-0000-7000-8000-000000000041",
            title: "Fuerza y WOD",
            objective: "Mantener una técnica sólida.",
          },
        ],
        executions: [
          {
            id: "019b4e0a-0000-7000-8000-000000000101",
            executionDate: "2026-10-20",
            status: "completed" as const,
            origin: "planned" as const,
            title: "Fuerza y WOD",
            plannedSessionId: "019b4e0a-0000-7000-8000-000000000041",
            blockCount: 2,
            rpe: 8,
            revision: 2,
            updatedAt: "2026-10-20T13:00:00.000Z",
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
  feeling: {
    id: "019b4e0a-0000-7000-8000-000000000061",
    rpe: 7,
    recoveryId: "019b4e0a-0000-4000-8000-000000000051",
  },
  blocks: [
    {
      id: "019b4e0a-0000-7000-8000-000000000102",
      plannedBlockId: "019b4e0a-0000-7000-8000-000000000042",
      position: 1,
      blockTypeId: "019b4e0a-0000-7000-8000-000000000003",
      title: "Fuerza",
      status: "completed_without_metric" as const,
      notes: "Realizado sin anotar la carga.",
      feeling: {
        id: "019b4e0a-0000-7000-8000-000000000062",
        techniqueQualityId: "019b4e0a-0000-4000-8000-000000000052",
      },
      substitutions: [
        {
          id: "019b4e0a-0000-7000-8000-000000000063",
          plannedPrescriptionId: "019b4e0a-0000-4000-8000-000000000043",
          actualMovementId: "019b4e0a-0000-4000-8000-000000000010",
          reasonId: "019b4e0a-0000-4000-8000-000000000053",
          note: "Sin material.",
        },
      ],
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

const personalRecord = {
  id: "019b4e0a-0000-7000-8000-000000000301",
  status: "suggested" as const,
  sourceType: "attempt" as const,
  movement: {
    id: "019b4e0a-0000-7000-8000-000000000010",
    code: "power-clean",
    name: "Power clean",
  },
  complex: null,
  repetitions: 2,
  loadKg: 85,
  achievedOn: "2026-10-20",
  confirmedAt: null,
  note: null,
  originAttemptId: "019b4e0a-0000-7000-8000-000000000201",
  previousLoadKg: 80,
};
const personalRecordReader = {
  list: async () => ({ items: [personalRecord], nextCursor: null }),
  listCurrent: async () => [personalRecord],
  listSuggestions: async () => [personalRecord],
} satisfies PersonalRecordReader;
const personalRecordWriter = {
  createManual: async () => personalRecord,
  decide: async () => personalRecord,
} satisfies PersonalRecordWriter;
const progressResponse = {
  from: "2026-10-01",
  to: "2026-10-31",
  groupBy: "movement" as const,
  totals: {
    repetitions: 120,
    technicalRepetitions: 80,
    durationSeconds: 300,
    technicalDurationSeconds: 240,
    volumeKg: 5400,
    technicalVolumeKg: 3200,
    sessions: 4,
    lastPracticedOn: "2026-10-30",
  },
  items: [
    {
      movement: {
        id: "019b4e0a-0000-7000-8000-000000000010",
        code: "power-clean",
        name: "Power clean",
      },
      family: {
        id: "019b4e0a-0000-7000-8000-000000000011",
        code: "clean",
        name: "Clean",
      },
      repetitions: 40,
      technicalRepetitions: 24,
      durationSeconds: 0,
      technicalDurationSeconds: 0,
      volumeKg: 3400,
      technicalVolumeKg: 2040,
      sessions: 3,
      lastPracticedOn: "2026-10-30",
    },
  ],
};
const progressReader = {
  getVolume: async () => progressResponse,
} satisfies ProgressReader;
const manualPersonalRecord = {
  movementId: "019b4e0a-0000-7000-8000-000000000010",
  repetitions: 2,
  loadKg: 85,
  achievedOn: "2026-10-20",
  note: "Primera vez",
};

describe("openapi contract document", () => {
  it("declares the version and the implemented paths", () => {
    expect(contract.openapi).toBe("3.1.0");
    expect(Object.keys(contract.paths)).toEqual(
      expect.arrayContaining([
        "/catalogs/{catalogKey}",
        "/catalog/movements",
        "/catalog/movement-families",
        "/catalog/complexes",
        "/personal-records",
        "/personal-records/current",
        "/personal-records/suggestions",
        "/personal-records/{recordId}",
        "/progress/volume",
        "/integrations/openclaw/movement-catalog",
      ]),
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

  it("GET /catalog/movement-families", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/catalog/movement-families" });

    expect(response.statusCode).toBe(200);
    expectValid(responseValidator("/catalog/movement-families", "get", 200), response.json());
  });

  it("GET /catalog/complexes", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/catalog/complexes" });

    expect(response.statusCode).toBe(200);
    expectValid(responseValidator("/catalog/complexes", "get", 200), response.json());
  });
});

describe("personal record responses conform to the contract", () => {
  const app = buildApp({
    personalRecordReader,
    personalRecordWriter,
  });
  afterAll(async () => app.close());

  it("GET /personal-records", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/personal-records" });

    expect(response.statusCode).toBe(200);
    expectValid(responseValidator("/personal-records", "get", 200), response.json());
  });

  it("GET /personal-records/current", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/personal-records/current",
    });

    expect(response.statusCode).toBe(200);
    expectValid(
      responseValidator("/personal-records/current", "get", 200),
      response.json(),
    );
  });

  it("GET /personal-records/suggestions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/personal-records/suggestions",
    });

    expect(response.statusCode).toBe(200);
    expectValid(
      responseValidator("/personal-records/suggestions", "get", 200),
      response.json(),
    );
  });

  it("PUT /personal-records/{recordId}", async () => {
    expectValid(
      requestValidator("/personal-records/{recordId}", "put"),
      manualPersonalRecord,
    );
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/personal-records/${personalRecord.id}`,
      payload: manualPersonalRecord,
    });

    expect(response.statusCode).toBe(200);
    expectValid(
      responseValidator("/personal-records/{recordId}", "put", 200),
      response.json(),
    );
  });

  it("PATCH /personal-records/{recordId}", async () => {
    const decision = { status: "confirmed" };
    expectValid(requestValidator("/personal-records/{recordId}", "patch"), decision);
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/personal-records/${personalRecord.id}`,
      payload: decision,
    });

    expect(response.statusCode).toBe(200);
    expectValid(
      responseValidator("/personal-records/{recordId}", "patch", 200),
      response.json(),
    );
  });
});

describe("progress responses conform to the contract", () => {
  const app = buildApp({ progressReader });
  afterAll(async () => app.close());

  it("GET /progress/volume", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/progress/volume?from=2026-10-01&to=2026-10-31",
    });

    expect(response.statusCode).toBe(200);
    expectValid(responseValidator("/progress/volume", "get", 200), response.json());
  });
});

describe("movement catalog import conforms to the contract", () => {
  const movementCatalogImport = {
    families: [{ code: "clean", name: "Clean" }],
    movements: [{ code: "power-clean", name: "Power clean", familyCode: "clean" }],
  };
  const movementCatalogWriter = {
    importCatalog: async () => ({
      status: "applied" as const,
      families: { created: 1, updated: 0, unchanged: 0 },
      movements: { created: 1, updated: 0, unchanged: 0 },
    }),
  };
  const app = buildApp({ movementCatalogWriter, openClawServiceKey: "test-secret" });
  afterAll(async () => app.close());

  it("PUT /integrations/openclaw/movement-catalog", async () => {
    expectValid(
      requestValidator("/integrations/openclaw/movement-catalog", "put"),
      movementCatalogImport,
    );
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/integrations/openclaw/movement-catalog",
      headers: { "x-openclaw-service-key": "test-secret" },
      payload: movementCatalogImport,
    });

    expect(response.statusCode).toBe(200);
    expectValid(
      responseValidator("/integrations/openclaw/movement-catalog", "put", 200),
      response.json(),
    );
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

describe("execution history conforms to the contract", () => {
  const app = buildApp({ executionHistoryReader });
  afterAll(async () => app.close());

  it("GET /session-executions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/session-executions?from=2026-10-01&to=2026-10-31",
    });

    expect(response.statusCode).toBe(200);
    expectValid(responseValidator("/session-executions", "get", 200), response.json());
  });

  it("GET /calendar", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2026-10-01&to=2026-10-31",
    });

    expect(response.statusCode).toBe(200);
    expectValid(responseValidator("/calendar", "get", 200), response.json());
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

  it("accepts the without-metrics modifier and block metrics", () => {
    const snapshot = {
      ...structuredClone(executionSnapshot),
      blocks: [
        {
          ...executionSnapshot.blocks[0]!,
          status: "completed" as const,
          withoutMetrics: false,
          metrics: {
            rounds: 5,
            extraRepetitions: 12,
            prescriptions: [
              {
                plannedPrescriptionId: "019b4e0a-0000-7000-8000-000000000043",
                actualWeight: { amount: 55, unit: "kg" },
                loadStatus: "scaled" as const,
              },
            ],
          },
        },
      ],
    };

    expectValid(requestValidator("/session-executions/{executionId}", "put"), snapshot);
  });

  it("accepts a technical practice duration on a set attempt", () => {
    const snapshot = {
      ...structuredClone(executionSnapshot),
      blocks: [
        {
          ...executionSnapshot.blocks[0]!,
          status: "completed" as const,
          attempts: [
            {
              id: "019b4e0a-0000-7000-8000-000000000071",
              plannedPrescriptionId: "019b4e0a-0000-4000-8000-000000000043",
              position: 1,
              status: "completed" as const,
              repetitions: 3,
              durationSeconds: 90,
            },
          ],
        },
      ],
    };

    expectValid(requestValidator("/session-executions/{executionId}", "put"), snapshot);
  });
});
