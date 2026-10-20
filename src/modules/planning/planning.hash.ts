import { hashCanonicalJson } from "../../shared/hash.js";

export function hashPlanningPublication(publication: unknown): string {
  return hashCanonicalJson(publication);
}
