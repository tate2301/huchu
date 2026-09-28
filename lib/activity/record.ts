import { currentActivityRequest } from "./context";
import { describeChange, type ActivityChange } from "./describe";

/**
 * Append one Prisma write to the open request's changes.
 *
 * Called by the query extension in `lib/prisma.ts` after every write resolves.
 * Outside a mutating API request — a script, a cron, a GET that happens to
 * write — there is no open request and this returns at once.
 *
 * Two writes to the same record in one request are one change: a handler that
 * creates a row and then stamps its number has created one thing.
 */
export function recordActivityWrite(args: {
  model: string | undefined;
  operation: string;
  queryArgs: unknown;
  result: unknown;
}) {
  const open = currentActivityRequest();
  if (!open || open.flushed) return;

  const change = describeChange(args);
  if (!change) return;

  const same = change.recordId
    ? open.changes.find(
        (existing) => existing.model === change.model && existing.recordId === change.recordId,
      )
    : undefined;
  if (!same) {
    open.changes.push(change);
    return;
  }
  mergeInto(same, change);
}

function mergeInto(existing: ActivityChange, next: ActivityChange) {
  // Created then updated is still created; anything then deleted is deleted.
  if (next.action === "deleted") existing.action = "deleted";
  existing.label = next.label ?? existing.label;
  if (existing.action === "created" || !next.fields?.length) return;
  const fields = new Map((existing.fields ?? []).map((field) => [field.name, field]));
  for (const field of next.fields) fields.set(field.name, field);
  existing.fields = [...fields.values()];
}
