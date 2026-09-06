"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Alert, Button, EmptyState, Skeleton } from "@corelithzw/react";

import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { cn } from "@corelithzw/ui/lib/utils";
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
  /** A pill — a status badge or a tone chip, which is a shape not a line. */
  badge?: boolean;
  /** Right-aligned, for a money or count column. */
  align?: "left" | "right";
};

/**
 * Deterministic widths: `Math.random()` would differ between the server render
 * and the client's, and trip a hydration mismatch.
 */
const SPREAD = [58, 74, 66, 80, 62, 71, 55, 77, 68, 63];

/**
 * Rows that match the table they are about to become, so nothing moves when
 * the data lands. Pass the same widths the real columns use.
 *
 * The rules the canvas sets, and why:
 *
 *   - the skeleton mirrors the real row's HEIGHT and COLUMN WIDTHS. A generic
 *     grey block is why campus lists used to reflow twice and jump their
 *     columns as data arrived.
 *   - it carries a HEADER, because the header is the part of a table that is
 *     known before the rows are. Drawing the column names immediately means
 *     somebody can read what is coming while it comes.
 *   - rows fade in on a stagger rather than appearing at once. Twelve identical
 *     bars switching on together reads as a flash; a 40ms cascade reads as a
 *     list arriving, and it costs nothing.
 *   - the shimmer is the design system's own (`.skeleton`, a 1.4s sweep), and
 *     `prefers-reduced-motion` kills both it and the stagger — the DS ships
 *     that media query globally.
 */
export function TableRowsSkeleton({
  columns,
  rows = 8,
  headers,
}: {
  columns: SkeletonColumn[];
  rows?: number;
  /** The real column names. Drawn solid, since they are known already. */
  headers?: string[];
}) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-[var(--card-radius)] border border-[color:var(--border)] bg-[color:var(--surface)]"
    >
      {headers?.length ? (
        <div className="flex items-center gap-3 border-b border-[color:var(--border)] bg-[color:var(--canvas)] px-3 py-2">
          {columns.map((column, index) => (
            <div
              key={index}
              className={cn(
                column.width ? "shrink-0" : "min-w-0 flex-1",
                column.align === "right" ? "text-right" : "",
              )}
              style={column.width ? { width: column.width } : undefined}
            >
              <span className="text-sm font-medium text-[color:var(--text-muted)]">
                {headers[index] ?? ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="divide-y divide-[color:var(--border-subtle)]">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="campus-skeleton-row flex items-center gap-3 px-3 py-3"
            style={{ animationDelay: `${rowIndex * 40}ms` }}
          >
            {columns.map((column, columnIndex) => (
              <div
                key={columnIndex}
                className={column.width ? "shrink-0" : "min-w-0 flex-1"}
                style={column.width ? { width: column.width } : undefined}
              >
                <div
                  className={cn(
                    "flex items-center gap-2",
                    column.align === "right" ? "justify-end" : "",
                  )}
                >
                  {column.avatar ? (
                    <Skeleton variant="circle" width={24} height={24} />
                  ) : null}
                  {column.badge ? (
                    <Skeleton height={19} width={62} radius={5} />
                  ) : (
                    <div
                      className={cn(
                        "min-w-0 space-y-1.5",
                        column.align === "right" ? "w-full" : "flex-1",
                      )}
                    >
                      <Skeleton
                        height={9}
                        width={`${SPREAD[(rowIndex + columnIndex) % SPREAD.length]}%`}
                      />
                      {column.twoLine ? <Skeleton height={7} width="34%" /> : null}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
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
          className="campus-skeleton-row space-y-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <Skeleton height={10} width="42%" />
          <Skeleton height={24} width="58%" />
          <Skeleton height={9} width="70%" />
        </div>
      ))}
    </div>
  );
}

/**
 * Cards or grouped rows, for the lists that are not tables — the bed board,
 * the shelf, a route's stops.
 */
export function CardsSkeleton({
  count = 6,
  columns = 3,
  lines = 3,
}: {
  count?: number;
  columns?: 1 | 2 | 3 | 4;
  lines?: number;
}) {
  const grid = {
    1: "grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];

  return (
    <div aria-hidden="true" className={cn("grid gap-3", grid)}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="campus-skeleton-row space-y-3 rounded-[var(--card-radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
          style={{ animationDelay: `${index * 45}ms` }}
        >
          <div className="flex items-center gap-2.5">
            <Skeleton variant="circle" width={32} height={32} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton height={10} width="62%" />
              <Skeleton height={8} width="38%" />
            </div>
          </div>
          {Array.from({ length: lines }, (_, line) => (
            <Skeleton
              key={line}
              height={8}
              width={`${SPREAD[(index + line) % SPREAD.length]}%`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A write in flight, over the thing being written.
 *
 * From the canvas: "The register dims to 50% and stops taking taps. A save that
 * accepts more marks halfway through is a save that loses them." So this is not
 * decoration — it is the interlock, and the dimming is how it tells you.
 */
export function SavingOverlay({
  saving,
  label = "Saving…",
  children,
}: {
  saving: boolean;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div
        className={cn(
          "transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)]",
          saving ? "pointer-events-none opacity-50" : "opacity-100",
        )}
        aria-busy={saving}
      >
        {children}
      </div>
      {saving ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <span
            role="status"
            className="campus-fade-in flex items-center gap-2 rounded-[var(--radius-pill)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm shadow-[var(--shadow-popover)]"
          >
            <span className="campus-pulse-dot size-1.5 rounded-full bg-[color:var(--brand)]" />
            {label}
          </span>
        </div>
      ) : null}
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
