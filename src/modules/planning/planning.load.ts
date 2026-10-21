function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Decides whether a prescription can record the weight actually used.
 *
 * The rule lives in the API so the PWA does not need to infer it from the
 * free-form details object. Percentage-based work also accepts an actual weight
 * because the athlete may use a different load than the requested 1RM share.
 */
export function prescriptionAllowsActualWeight(
  details: Record<string, unknown> | null | undefined,
): boolean {
  if (!details) return false;

  const prescribedWeight = details.prescribedWeight;
  if (isRecord(prescribedWeight) && isNonNegativeNumber(prescribedWeight.amount)) {
    return true;
  }
  if (isNonNegativeNumber(details.prescribedWeightKg)) {
    return true;
  }
  return isFiniteNumber(details.oneRepMaxPercentage);
}
