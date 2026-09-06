"use client";

import type { ComponentProps, ReactNode } from "react";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { cn } from "@/lib/utils";

import { RecordList, type RecordListRow } from "./record-list";

/**
 * Grouped record lists.
 *
 * Two recipes, one component, because they only differ in how the buckets are
 * named: `lists-grouped-by-date` for anything where when it happened is how
 * you find it, `lists-grouped-by-section` for a directory you scan by letter.
 *
 * Headers pin to `top-14` rather than `top-0`. The recipe says to make the
 * list the scrolling ancestor so the header pins inside it — but these lists
 * sit on a page that scrolls as a whole, and a list with its own scrollbar
 * inside a scrolling page is a worse trade than one offset. Fourteen is the
 * top app bar's height; pin at zero and the header slides under it.
 */

export type RecordListSection = {
  id: string;
  label: string;
  rows: RecordListRow[];
  /**
   * Render the section even with nothing in it. "Today — nothing yet" is
   * information; a missing Today section is just an absence you have to infer.
   */
  alwaysShow?: boolean;
  /** Shown in place of the rows when the section is empty. */
  emptyBody?: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/**
 * The five buckets from the recipe: today, yesterday, earlier this week, last
 * week, earlier. Fewer loses the signal, more is detail nobody asked for.
 *
 * `now` is a parameter so this is testable and so a list rendering many
 * sections buckets every row against one instant rather than drifting across
 * midnight halfway down.
 */
export function bucketByDate<T>(
  items: T[],
  getDate: (item: T) => string | Date | null | undefined,
  now: Date = new Date(),
): Array<{ id: string; label: string; items: T[] }> {
  const today = startOfDay(now);
  const buckets: Array<{ id: string; label: string; items: T[] }> = [
    { id: "today", label: "Today", items: [] },
    { id: "yesterday", label: "Yesterday", items: [] },
    { id: "this-week", label: "Earlier this week", items: [] },
    { id: "last-week", label: "Last week", items: [] },
    { id: "earlier", label: "Earlier", items: [] },
  ];

  for (const item of items) {
    const raw = getDate(item);
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) {
      buckets[4].items.push(item);
      continue;
    }
    const days = Math.round((today - startOfDay(date)) / MS_PER_DAY);
    if (days <= 0) buckets[0].items.push(item);
    else if (days === 1) buckets[1].items.push(item);
    else if (days <= 6) buckets[2].items.push(item);
    else if (days <= 13) buckets[3].items.push(item);
    else buckets[4].items.push(item);
  }

  return buckets;
}

/**
 * The same five-bucket idea pointed the other way, for dates that have not
 * happened yet. A due date reads forwards — overdue, today, tomorrow, this
 * week, later — and running it through the backward buckets would file
 * everything you still owe somebody under "Today".
 */
export function bucketByDueDate<T>(
  items: T[],
  getDate: (item: T) => string | Date | null | undefined,
  now: Date = new Date(),
): Array<{ id: string; label: string; items: T[] }> {
  const today = startOfDay(now);
  const buckets: Array<{ id: string; label: string; items: T[] }> = [
    { id: "overdue", label: "Overdue", items: [] },
    { id: "today", label: "Today", items: [] },
    { id: "tomorrow", label: "Tomorrow", items: [] },
    { id: "this-week", label: "Later this week", items: [] },
    { id: "later", label: "Later", items: [] },
  ];

  for (const item of items) {
    const raw = getDate(item);
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) {
      buckets[4].items.push(item);
      continue;
    }
    const days = Math.round((startOfDay(date) - today) / MS_PER_DAY);
    if (days < 0) buckets[0].items.push(item);
    else if (days === 0) buckets[1].items.push(item);
    else if (days === 1) buckets[2].items.push(item);
    else if (days <= 7) buckets[3].items.push(item);
    else buckets[4].items.push(item);
  }

  return buckets;
}

/**
 * Bucket by first letter, insertion-ordered so the sections come out in the
 * order the caller sorted the rows into. Sort first, then group — grouping a
 * shuffled list and sorting the groups gives you sorted headings over
 * unsorted rows.
 */
export function bucketByLetter<T>(
  items: T[],
  getLabel: (item: T) => string,
): Array<{ id: string; label: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const first = getLabel(item).trim().charAt(0).toUpperCase();
    // Anything that does not start with a letter shares one bucket; a
    // per-symbol heading is a heading over one row.
    const key = /[A-Z]/.test(first) ? first : "#";
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()].map(([label, bucketItems]) => ({
    id: `section-${label.toLowerCase()}`,
    label,
    items: bucketItems,
  }));
}

export function GroupedRecordList({
  sections,
  isLoading,
  emptyTitle = "Nothing here yet",
  emptyBody,
  emptyAction,
  /** The A–Z rail. Worth it past about thirty rows, pointless below. */
  showJumpStrip = false,
  className,
  selection,
}: {
  sections: RecordListSection[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  showJumpStrip?: boolean;
  className?: string;
  /**
   * Passed straight through to each section's list. The selection spans
   * sections — picking three people under B and two under M is one selection
   * of five, because the letters are how the page is arranged, not what the
   * records are.
   */
  selection?: ComponentProps<typeof RecordList>["selection"];
}) {
  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <Skeleton height={28} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }

  const visible = sections.filter((section) => section.alwaysShow || section.rows.length > 0);
  if (visible.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />;
  }

  return (
    <div className={cn("flex gap-3", className)}>
      <div className="min-w-0 flex-1 space-y-5">
        {visible.map((section) => (
          <section key={section.id} aria-labelledby={`${section.id}-heading`}>
            <h3
              id={`${section.id}-heading`}
              // The bar is opaque so rows do not show through the heading as
              // they slide under it.
              className="sticky top-14 z-10 -mx-1 flex items-baseline gap-2 bg-[var(--surface-base)] px-1 py-1.5 text-sm font-medium text-[var(--text-subtle)]"
            >
              <span>{section.label}</span>
              <span className="font-mono normal-case tracking-normal">
                {section.rows.length}
              </span>
            </h3>

            {section.rows.length > 0 ? (
              <RecordList rows={section.rows} selection={selection} />
            ) : (
              <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-3 py-4 text-sm text-[var(--text-muted)]">
                {section.emptyBody ?? "Nothing yet."}
              </p>
            )}
          </section>
        ))}
      </div>

      {showJumpStrip ? (
        <nav
          aria-label="Jump to section"
          className="sticky top-14 hidden h-fit flex-none flex-col gap-0.5 pt-1 sm:flex"
        >
          {visible.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-label={`Jump to ${section.label}`}
              onClick={() => {
                const heading = document.getElementById(`${section.id}-heading`);
                const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                heading?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
              }}
              className="rounded px-1.5 py-0.5 text-sm font-medium text-[var(--text-subtle)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
            >
              {section.label}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
