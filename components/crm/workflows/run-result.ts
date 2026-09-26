/**
 * Reading a workflow run: where its record lives, and what its actions did.
 *
 * Shared by the activity list and a run's own page, so the two cannot come
 * to disagree about why a run failed.
 */

/** Where a run's record lives, so a run is one click from what it changed. */
export const ENTITY_HREF: Record<string, (id: string) => string> = {
  LEAD: (id) => `/crm/leads/${id}`,
  DEAL: (id) => `/crm/deals/${id}`,
  PERSON: (id) => `/crm/people/${id}`,
  CLIENT: (id) => `/crm/companies/${id}`,
  SITE: (id) => `/crm/sites/${id}`,
};

/** One action's outcome, as the runner stores it. */
export type RunOutcome = { type: string | null; ok: boolean; detail: string | null };

/**
 * The runner stores its result as a bare array of `{ type, ok, detail }` —
 * one entry per action. Anything else reads as no outcomes rather than
 * throwing: a run from before the runner wrote this shape still opens.
 */
export function runOutcomes(result: unknown): RunOutcome[] {
  if (!Array.isArray(result)) return [];
  return result
    .filter(
      (outcome): outcome is { type?: unknown; ok?: unknown; detail?: unknown } =>
        Boolean(outcome) && typeof outcome === "object",
    )
    .map((outcome) => ({
      type: typeof outcome.type === "string" ? outcome.type : null,
      ok: outcome.ok !== false,
      detail: typeof outcome.detail === "string" ? outcome.detail : null,
    }));
}

/**
 * Why a run did not do what it was meant to.
 *
 * This used to look for `result.actions[].error`, which is a shape nothing
 * writes, so every failed run rendered with no reason at all: the one thing
 * somebody opens the screen to find out.
 *
 * Named by action, because "Record not found" from three different actions in
 * one rule is three different problems.
 */
export function failureMessage(result: unknown): string | null {
  const failures = runOutcomes(result)
    .filter((outcome) => !outcome.ok)
    .map((outcome) => {
      const detail = outcome.detail ?? "Action failed";
      return outcome.type ? `${actionLabel(outcome.type)}: ${detail}` : detail;
    });

  return failures.length > 0 ? failures.join(" · ") : null;
}

/** `ADD_TAG` is a database value; "Add tag" is what somebody reads. */
export function actionLabel(type: string): string {
  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}
