"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Alert, Button, EmptyState, Skeleton } from "@corelithzw/react";

import { getApiErrorMessage } from "@/lib/api-client";
import { whoCan, type SchoolAction, type SchoolResource } from "@/lib/schools/access";

/**
 * The campus module's loading / empty / error / denied / not-found treatments,
 * in one place.
 *
 * Campus ships no `error.tsx`, `not-found.tsx` or `loading.tsx` anywhere, and
 * every list "loads" by swapping a sentence into the middle of an empty table —
 * which reflows the page twice and jumps the column widths. These are the
 * shapes the design settled on; the rules they encode:
 *
 *   - a skeleton mirrors the row it is about to become, never a spinner, and
 *     never a shimmer sweep, which draws the eye to the wait rather than the work;
 *   - an empty list is not a failure, so it is an empty state and not an Alert;
 *   - the three empties are different sentences — nothing yet offers the verb
 *     that fills it, nothing matched repeats the filter that emptied it, and
 *     nothing left to do is good news and never offers a create button;
 *   - a refusal names the role that *can*, because "ask the bursar" is a next
 *     step and "you do not have permission" is a dead end.
 */

/* ── loading ─────────────────────────────────────────────────────────── */

export type SkeletonColumn = {
  /** Fixed pixel width, or omitted for a flexible column. */
  width?: number;
  /** Draw a round avatar ahead of the text. */
  avatar?: boolean;
  /** Two stacked lines rather than one. */
  twoLine?: boolean;
};

/**
 * Deterministic widths: `Math.random()` would differ between the server render
 * and the client's, and trip a hydration mismatch.
 */
const SPREAD = [58, 74, 66, 80, 62, 71, 55, 77, 68, 63];

/**
 * Rows that match the table they are about to become, so nothing moves when
 * the data lands. Pass the same widths the real columns use.
 */
export function TableRowsSkeleton({
  columns,
  rows = 8,
}: {
  columns: SkeletonColumn[];
  rows?: number;
}) {
  return (
    <div aria-hidden="true" className="divide-y divide-[color:var(--border-subtle)]">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-3 px-3 py-3">
          {columns.map((column, columnIndex) => (
            <div
              key={columnIndex}
              className={column.width ? "shrink-0" : "min-w-0 flex-1"}
              style={column.width ? { width: column.width } : undefined}
            >
              <div className="flex items-center gap-2">
                {column.avatar ? <Skeleton variant="circle" width={24} height={24} /> : null}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton
                    height={9}
                    width={`${SPREAD[(rowIndex + columnIndex) % SPREAD.length]}%`}
                  />
                  {column.twoLine ? <Skeleton height={7} width="34%" /> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A block of tiles while their numbers are being counted. */
export function StatsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid gap-3 sm:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="space-y-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
        >
          <Skeleton height={10} width="42%" />
          <Skeleton height={24} width="58%" />
          <Skeleton height={9} width="70%" />
        </div>
      ))}
    </div>
  );
}

/* ── empty ───────────────────────────────────────────────────────────── */

/**
 * Nothing has been created yet. Offers the verb that fills it — and only that
 * verb, since an empty state gets at most one action.
 */
export function NothingYet({
  title,
  body,
  action,
  icon,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return <EmptyState icon={icon} title={title} body={body} action={action} />;
}

/**
 * Records exist; the filters hid all of them. Repeats what was filtered and
 * offers to undo it — never a create button, which would answer a question
 * nobody asked.
 */
export function NothingMatched({
  what = "results",
  filters,
  onClear,
}: {
  /** Plural noun for the rows — "students", "invoices". */
  what?: string;
  /** The narrowing in force, in the user's words: ["Form 2", "Suspended"]. */
  filters?: string[];
  onClear?: () => void;
}) {
  const named = (filters ?? []).filter(Boolean);
  return (
    <EmptyState
      title={`No ${what} matched`}
      body={
        named.length > 0
          ? `Nothing is left after narrowing to ${named.join(" and ")}.`
          : "Nothing is left after the filters in force."
      }
      action={
        onClear ? (
          <Button variant="secondary" onClick={onClear}>
            Clear the filters
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * Good news: the queue is empty because the work is done. Deliberately offers
 * no create button — there is nothing to create.
 */
export function NothingLeftToDo({
  title,
  body,
  action,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return <EmptyState title={title} body={body} action={action} />;
}

/* ── error ───────────────────────────────────────────────────────────── */

/** A load that failed, with the way back. */
export function LoadError({
  what,
  error,
  onRetry,
}: {
  /** What would not load, as a noun phrase: "the fee ledger". */
  what: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const titled = what.charAt(0).toUpperCase() + what.slice(1);
  return (
    <Alert
      tone="danger"
      title={`${titled} would not load`}
      actions={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {getApiErrorMessage(error)}
    </Alert>
  );
}

/** A write that failed. Separate from `LoadError` because the verb differs. */
export function SaveError({ what, error }: { what: string; error: unknown }) {
  return (
    <Alert tone="danger" title={`${what} was not saved`}>
      {getApiErrorMessage(error)}
    </Alert>
  );
}

/* ── denied ──────────────────────────────────────────────────────────── */

/**
 * The signed-in person may look but not touch. Naming who can is the point.
 */
export function NotYourJob({
  action,
  resource,
  what,
}: {
  action: SchoolAction;
  resource: SchoolResource;
  /** The thing they tried to act on: "a fee waiver". */
  what: string;
}) {
  const who = whoCan(resource, action);
  return (
    <Alert tone="info" title={`${what} is not yours to change`}>
      {who
        ? `This is ${who} to do. You can see everything here; ask them to make the change.`
        : "You can see everything here, but changing it is somebody else's job."}
    </Alert>
  );
}

/* ── not found ───────────────────────────────────────────────────────── */

/**
 * A record that is not there — usually a stale link or one that was archived.
 */
export function RecordNotFound({
  what,
  backHref,
  backLabel,
}: {
  /** "That pupil", "That invoice". */
  what: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <EmptyState
      title={`${what} is not here`}
      body="It may have been archived, or the link may be out of date."
      action={
        <Button asChild variant="secondary">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      }
    />
  );
}
