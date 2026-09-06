/**
 * Chasing money that is late.
 *
 * The organising idea is the promise: "they said Friday" is what turns a chase
 * list into a plan, and a promise that came and went is a much stronger signal
 * than another day of silence.
 */
import type { CrmCollectionOutcome } from "@corelithzw/db";
import { z } from "zod";

export const COLLECTION_OUTCOMES = [
  "PROMISED_TO_PAY",
  "DISPUTED",
  "NO_ANSWER",
  "PARTIAL_PAYMENT",
  "PAID",
  "ESCALATED",
] as const;

export const COLLECTION_OUTCOME_LABELS: Record<CrmCollectionOutcome, string> = {
  PROMISED_TO_PAY: "Promised to pay",
  DISPUTED: "Disputes the invoice",
  NO_ANSWER: "No answer",
  PARTIAL_PAYMENT: "Paid part of it",
  PAID: "Paid in full",
  ESCALATED: "Escalated",
};

export const AGEING_BUCKETS = ["CURRENT", "D1_30", "D31_60", "D61_90", "D90_PLUS"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export const AGEING_LABELS: Record<AgeingBucket, string> = {
  CURRENT: "Not yet due",
  D1_30: "1–30 days",
  D31_60: "31–60 days",
  D61_90: "61–90 days",
  D90_PLUS: "Over 90 days",
};

export function daysOverdue(dueDate: Date | string | null, now: Date = new Date()): number {
  if (!dueDate) return 0;
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (Number.isNaN(due.getTime())) return 0;
  const days = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
  return Math.max(0, days);
}

export function ageingBucket(dueDate: Date | string | null, now: Date = new Date()): AgeingBucket {
  const days = daysOverdue(dueDate, now);
  if (days === 0) return "CURRENT";
  if (days <= 30) return "D1_30";
  if (days <= 60) return "D31_60";
  if (days <= 90) return "D61_90";
  return "D90_PLUS";
}

export type CollectionItem = {
  outstanding: number;
  dueDate: Date | string | null;
  /** The most recent promise, if there is one. */
  promisedAt?: Date | string | null;
};

export type AgeingSummary = {
  bucket: AgeingBucket;
  label: string;
  count: number;
  amount: number;
};

export function summarizeAgeing(
  items: CollectionItem[],
  now: Date = new Date(),
): AgeingSummary[] {
  const totals = new Map<AgeingBucket, { count: number; amount: number }>(
    AGEING_BUCKETS.map((bucket) => [bucket, { count: 0, amount: 0 }]),
  );

  for (const item of items) {
    if (item.outstanding <= 0) continue;
    const bucket = ageingBucket(item.dueDate, now);
    const row = totals.get(bucket)!;
    row.count += 1;
    row.amount += item.outstanding;
  }

  return AGEING_BUCKETS.map((bucket) => ({
    bucket,
    label: AGEING_LABELS[bucket],
    count: totals.get(bucket)!.count,
    amount: Math.round(totals.get(bucket)!.amount * 100) / 100,
  }));
}

/**
 * How urgently something needs chasing, 0–100.
 *
 * Age and amount both count, but a broken promise counts for more than either:
 * somebody who said Friday and didn't pay has told you something that silence
 * never does.
 */
export function chaseUrgency(
  item: CollectionItem & { promiseKept?: boolean },
  now: Date = new Date(),
): number {
  const days = daysOverdue(item.dueDate, now);
  if (days === 0) return 0;

  let score = Math.min(50, days);

  // Larger balances first among invoices of the same age.
  if (item.outstanding >= 10_000) score += 20;
  else if (item.outstanding >= 1_000) score += 12;
  else if (item.outstanding > 0) score += 5;

  if (item.promisedAt) {
    const promised = typeof item.promisedAt === "string" ? new Date(item.promisedAt) : item.promisedAt;
    if (!Number.isNaN(promised.getTime())) {
      if (promised.getTime() < now.getTime() && item.promiseKept !== true) {
        // A promise that came and went.
        score += 30;
      } else {
        // A live promise: leave them alone until the day comes.
        score -= 25;
      }
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Sort a chase list: most urgent first, largest first within the same score. */
export function orderChaseList<T extends CollectionItem & { promiseKept?: boolean }>(
  items: T[],
  now: Date = new Date(),
): T[] {
  return [...items].sort((a, b) => {
    const scoreDiff = chaseUrgency(b, now) - chaseUrgency(a, now);
    if (scoreDiff !== 0) return scoreDiff;
    return b.outstanding - a.outstanding;
  });
}

export const collectionNoteSchema = z.object({
  documentId: z.string().uuid(),
  outcome: z.enum(COLLECTION_OUTCOMES),
  promisedAt: z.string().datetime().nullable().optional(),
  promisedAmount: z.number().finite().nonnegative().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** A promise with no date is not a promise, so the form insists on one. */
export function validateCollectionNote(input: {
  outcome: CrmCollectionOutcome;
  promisedAt?: string | null;
}): string | null {
  if (input.outcome === "PROMISED_TO_PAY" && !input.promisedAt) {
    return "A promise to pay needs a date — that date is the whole point of recording it";
  }
  return null;
}
