import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import {
  blockExecution,
  personalRecord,
  setAttempt,
} from "../../db/schema.js";
import { confirmedLoadsByAttempt } from "./personal-records.repository.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type DatabaseTransaction = Transaction;

export type PersonalRecordAttempt = {
  id: string;
  movementId?: string;
  complexVersionId?: string;
  status: string;
  position: number;
  repetitions?: number;
  weight?: { amount: number; unit: string };
};

export type PersonalRecordLink = {
  id: string;
  attemptId: string | null;
  status: string;
};

export async function capturePersonalRecordLinks(
  transaction: Transaction,
  executionId: string,
): Promise<PersonalRecordLink[]> {
  return transaction
    .select({
      id: personalRecord.id,
      attemptId: personalRecord.setAttemptId,
      status: personalRecord.status,
    })
    .from(personalRecord)
    .innerJoin(setAttempt, eq(personalRecord.setAttemptId, setAttempt.id))
    .innerJoin(blockExecution, eq(setAttempt.blockExecutionId, blockExecution.id))
    .where(eq(blockExecution.sessionExecutionId, executionId));
}

export async function deleteSuggestedPersonalRecords(
  transaction: Transaction,
  links: PersonalRecordLink[],
): Promise<void> {
  const ids = links.filter((link) => link.status === "suggested").map((link) => link.id);
  if (ids.length === 0) return;
  await transaction.delete(personalRecord).where(inArray(personalRecord.id, ids));
}

export async function restorePersonalRecordLinks(
  transaction: Transaction,
  links: PersonalRecordLink[],
  incomingAttemptIds: Set<string>,
): Promise<void> {
  for (const link of links) {
    if (link.status === "suggested" || !link.attemptId) continue;
    if (!incomingAttemptIds.has(link.attemptId)) continue;
    await transaction
      .update(personalRecord)
      .set({ setAttemptId: link.attemptId })
      .where(eq(personalRecord.id, link.id));
  }
}

function normalizeLoadKg(weight: PersonalRecordAttempt["weight"]): number | null {
  if (!weight || !Number.isFinite(weight.amount) || weight.amount <= 0) return null;
  const kilograms =
    weight.unit === "kg"
      ? weight.amount
      : weight.unit === "lb"
        ? weight.amount * 0.45359237
        : null;
  if (kilograms === null) return null;
  return Math.round(kilograms * 1000) / 1000;
}

function anchorKey(movementId: string | undefined, complexVersionId: string | undefined, reps: number) {
  return `${movementId ? `m:${movementId}` : `c:${complexVersionId}`}|${reps}`;
}

export async function generatePersonalRecordSuggestions(
  transaction: Transaction,
  input: {
    athleteId: string;
    executionDate: string;
    executionStatus: string;
    attempts: PersonalRecordAttempt[];
  },
): Promise<void> {
  if (input.executionStatus !== "completed") return;

  const candidates = input.attempts
    .map((attempt) => {
      if (attempt.status !== "completed") return null;
      if (!attempt.repetitions || !Number.isInteger(attempt.repetitions) || attempt.repetitions <= 0) {
        return null;
      }
      const anchorCount = Number(Boolean(attempt.movementId)) + Number(Boolean(attempt.complexVersionId));
      if (anchorCount !== 1) return null;
      const loadKg = normalizeLoadKg(attempt.weight);
      if (loadKg === null) return null;
      return {
        ...attempt,
        repetitions: attempt.repetitions,
        loadKg,
      };
    })
    .filter((attempt): attempt is NonNullable<typeof attempt> => attempt !== null);

  if (candidates.length === 0) return;

  const decided = await confirmedLoadsByAttempt(
    transaction,
    input.athleteId,
    candidates.map((candidate) => candidate.id),
  );

  const groups = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    if (decided.has(candidate.id)) continue;
    const key = anchorKey(candidate.movementId, candidate.complexVersionId, candidate.repetitions);
    const current = groups.get(key);
    if (
      !current ||
      candidate.loadKg > current.loadKg ||
      (candidate.loadKg === current.loadKg && candidate.position < current.position)
    ) {
      groups.set(key, candidate);
    }
  }

  const confirmed = await transaction
    .select({
      movementId: personalRecord.movementId,
      complexVersionId: personalRecord.complexVersionId,
      repetitions: personalRecord.repetitions,
      loadKg: personalRecord.loadKg,
    })
    .from(personalRecord)
    .where(
      and(
        eq(personalRecord.athleteId, input.athleteId),
        eq(personalRecord.status, "confirmed"),
      ),
    );

  const best = new Map<string, number>();
  for (const record of confirmed) {
    const key = anchorKey(
      record.movementId ?? undefined,
      record.complexVersionId ?? undefined,
      record.repetitions,
    );
    const current = best.get(key);
    if (current === undefined || record.loadKg > current) best.set(key, record.loadKg);
  }

  const now = new Date();
  for (const candidate of groups.values()) {
    const key = anchorKey(candidate.movementId, candidate.complexVersionId, candidate.repetitions);
    const reference = best.get(key);
    if (reference !== undefined && candidate.loadKg <= reference) continue;
    await transaction
      .insert(personalRecord)
      .values({
        athleteId: input.athleteId,
        setAttemptId: candidate.id,
        movementId: candidate.movementId ?? null,
        complexVersionId: candidate.complexVersionId ?? null,
        repetitions: candidate.repetitions,
        loadKg: candidate.loadKg,
        achievedOn: input.executionDate,
        status: "suggested",
        sourceType: "attempt",
        confirmedAt: null,
        note: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }
}
