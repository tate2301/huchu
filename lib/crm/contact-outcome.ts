/**
 * How a contact attempt went — the fact a "Call" alone does not carry. A call
 * nobody answered is still worth logging (it is why the deal is quiet), but it
 * is not the same thing as a conversation, and the feed should say which.
 *
 * Stored on the activity's `metadata.outcome`.
 */
export const CONTACT_OUTCOMES = ["REACHED", "NO_ANSWER", "LEFT_MESSAGE"] as const;

export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

export const CONTACT_OUTCOME_LABELS: Record<ContactOutcome, string> = {
  REACHED: "Reached",
  NO_ANSWER: "No answer",
  LEFT_MESSAGE: "Left message",
};

/** The outcome an activity's metadata records, if it records one. */
export function contactOutcomeOf(metadata: unknown): ContactOutcome | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { outcome?: unknown }).outcome;
  return CONTACT_OUTCOMES.find((outcome) => outcome === value) ?? null;
}
