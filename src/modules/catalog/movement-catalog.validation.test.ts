import { describe, expect, it } from "vitest";

import { validateMovementCatalogImport } from "./movement-catalog.validation.js";

describe("movement catalog import validation", () => {
  it("normalizes a complete import", () => {
    const result = validateMovementCatalogImport({
      families: [{ code: " clean ", name: " Clean " }],
      movements: [{ code: " power-clean ", name: " Power clean ", familyCode: " clean " }],
    });

    expect(result).toEqual({
      valid: true,
      input: {
        families: [{ code: "clean", name: "Clean" }],
        movements: [{ code: "power-clean", name: "Power clean", familyCode: "clean" }],
      },
    });
  });

  it("allows movements without a families array", () => {
    const result = validateMovementCatalogImport({
      movements: [{ code: "snatch", name: "Snatch", familyCode: "snatch" }],
    });

    expect(result.valid).toBe(true);
  });

  it("allows families without movements", () => {
    const result = validateMovementCatalogImport({
      families: [{ code: "snatch", name: "Snatch" }],
    });

    expect(result.valid).toBe(true);
  });

  it("rejects an empty import", () => {
    const result = validateMovementCatalogImport({});
    expect(result).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ path: "body" })],
    });
  });

  it("rejects unknown fields", () => {
    const result = validateMovementCatalogImport({
      families: [{ code: "clean", name: "Clean", extra: true }],
      movements: [{ code: "power-clean", name: "Power clean", familyCode: "clean", id: "x" }],
    });

    expect(result).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "families[0].extra" }),
        expect.objectContaining({ path: "movements[0].id" }),
      ]),
    });
  });

  it("rejects invalid and duplicate codes", () => {
    const result = validateMovementCatalogImport({
      families: [
        { code: "Clean", name: "Clean" },
        { code: "clean", name: "Clean" },
        { code: "clean", name: "Clean again" },
      ],
    });

    expect(result).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "families[0].code" }),
        expect.objectContaining({ path: "families[2].code", message: "Must be unique within the import." }),
      ]),
    });
  });

  it("requires a family code on movements", () => {
    const result = validateMovementCatalogImport({
      movements: [{ code: "power-clean", name: "Power clean" }],
    });

    expect(result).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ path: "movements[0].familyCode" })],
    });
  });
});
