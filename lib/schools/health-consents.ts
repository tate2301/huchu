/**
 * The four consents, with no database behind them.
 *
 * Split out of `lib/schools/health.ts` for the same reason `calendar-kinds.ts`
 * is split out of `calendar.ts`: the welfare form renders one checkbox per
 * consent, and importing the labels from a Prisma-importing module drags `pg`
 * into the browser bundle.
 */

export type ConsentKey =
  | "consentFirstAid"
  | "consentEmergencyTreatment"
  | "consentPhotography"
  | "consentOutings";

export const CONSENT_LABELS: Record<ConsentKey, string> = {
  consentFirstAid: "Ordinary first aid without ringing home",
  consentEmergencyTreatment: "Emergency treatment, including hospital",
  consentPhotography: "Photographs for the newsletter and website",
  consentOutings: "Leaving the grounds on a school trip",
};

export const CONSENT_KEYS = Object.keys(CONSENT_LABELS) as ConsentKey[];

export function anyConsentGiven(flags: Partial<Record<ConsentKey, boolean>>) {
  return CONSENT_KEYS.some((key) => flags[key] === true);
}

/**
 * The one welfare gap that outranks the rest, spelled once.
 *
 * `healthGaps` writes it and the welfare list reads it back to count the
 * children the alert is about, so it lives here rather than as a string
 * repeated in both — and here rather than in `health.ts`, because the list
 * doing the reading is a client component and that module imports Prisma.
 *
 * Matched exactly rather than inferred from the other gaps: a child can be
 * missing a doctor and a consent and still not be this, and this is the row
 * somebody rings home about before anything else on the page.
 */
export const URGENT_GAP = "Allergy on file, no consent to treat";
