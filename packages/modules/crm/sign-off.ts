import { randomBytes } from "crypto";
import { z } from "zod";

/**
 * Client sign-off on a finished job.
 *
 * A job was marked done by whoever did it, which is the one person whose
 * opinion is not evidence. The dispute three weeks later — "that was never
 * finished", "nobody told us it was done" — has no record to settle it with.
 *
 * So the client says so, on their own phone, without an account: they type
 * their name, optionally rate the work, optionally say something. The typed
 * name is the signature; a canvas scribble on a phone is not more binding and
 * is far more annoying to produce.
 *
 * Signing off is once. A second submission is refused rather than
 * overwriting — the first answer is the record, and letting a link re-answer
 * would mean whoever holds it can rewrite history.
 */

export function generateSignOffToken(): string {
  return randomBytes(32).toString("base64url");
}

export const signOffSubmissionSchema = z.object({
  /** Who is signing. Required — an anonymous sign-off settles nothing. */
  name: z.string().trim().min(2).max(120),
  /** 1–5. Optional, because a job can be accepted without being praised. */
  rating: z.number().int().min(1).max(5).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

export type SignOffSubmission = z.infer<typeof signOffSubmissionSchema>;

/** Statuses where asking for a sign-off makes sense. */
const SIGN_OFF_READY = new Set(["IN_PROGRESS", "COMPLETED"]);

export function canAskForSignOff(status: string): boolean {
  return SIGN_OFF_READY.has(status);
}

export type SignOffJobSource = {
  workOrderNo: string;
  title: string;
  description: string | null;
  completedAt: Date | string | null;
  addressLine: string | null;
  signOffAt: Date | string | null;
  signOffName: string | null;
  client: { name: string } | null;
  site: { name: string; addressLine: string | null; city: string | null } | null;
  items?: Array<{ description: string; isDone?: boolean }> | null;
};

export type SignOffJob = {
  reference: string;
  title: string;
  description: string | null;
  completedAt: string | null;
  where: string | null;
  customerName: string | null;
  /** What was actually done, so somebody can check it against the place. */
  items: string[];
  /** Already answered — the page shows the receipt rather than the form. */
  signedOffAt: string | null;
  signedOffName: string | null;
};

function isoOf(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function buildSignOffJob(source: SignOffJobSource): SignOffJob {
  const where =
    [source.site?.name, source.site?.addressLine ?? source.addressLine, source.site?.city]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(", ") || null;

  return {
    reference: source.workOrderNo,
    title: source.title,
    description: source.description,
    completedAt: isoOf(source.completedAt),
    where,
    customerName: source.client?.name ?? null,
    items: (source.items ?? [])
      .map((item) => item.description?.trim())
      .filter((description): description is string => Boolean(description)),
    signedOffAt: isoOf(source.signOffAt),
    signedOffName: source.signOffName,
  };
}
