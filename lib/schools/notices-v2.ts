import { fetchJson } from "@/lib/api-client";

/**
 * Notices, from the browser's side.
 *
 * `lib/schools/notices.ts` is the server half — it reaches for Prisma and
 * cannot be imported into a component. This is the other end of the same
 * endpoint, and it exists so the one write that can change a letter after it
 * has gone out is written down once, next to the sentence explaining what it
 * does, rather than assembled by hand in a dialog.
 *
 * As everywhere in this module, `successResponse` does not wrap: these read the
 * body directly rather than reaching for `.data.data`.
 */

export type NoticeSeverity = "INFO" | "WARNING" | "CRITICAL";

/**
 * Put right what a sent notice says.
 *
 * Fixes the wording in place. It reaches nobody: the notice is a row the
 * portals read, so a family who has already opened it keeps the version they
 * read and is told nothing, and a family who opens it tomorrow sees the new
 * one. That is the right trade for a typo or a wrong room number and the wrong
 * one for a change of plan — for that, send a correction, which is a second
 * notice addressed to exactly the people the first one reached.
 *
 * The audience is absent from the arguments on purpose. Who received a notice
 * was fixed when the recipient rows were written and cannot be changed after
 * the fact; only what they read can.
 */
export function updateSentNotice(input: {
  id: string;
  title?: string;
  body?: string;
  severity?: NoticeSeverity;
}) {
  return fetchJson<{ id: string; title: string; summary: string; severity: string }>(
    "/api/v2/schools/notices",
    { method: "PATCH", body: JSON.stringify(input) },
  );
}
