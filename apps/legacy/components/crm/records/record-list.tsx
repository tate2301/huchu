"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { Button, EmptyState, Skeleton } from "@corelithzw/react";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { DataTableFloatingActions } from "@corelithzw/ui/components/data-table-floating-actions";
import { ChevronRight } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

import { RecordCell, type RecordCellKind } from "@/components/records/record-table";

/**
 * The CRM record list.
 *
 * People, companies, sites, collections and the rest are lists of things you
 * open, not grids of numbers you compare — so they get the list pattern rather
 * than a data table. Each row is a title, a supporting line, and a small
 * cluster of facts on the right; the whole row is the link, which is what makes
 * it work with a thumb as well as a mouse.
 *
 * DataTable is still the right answer for a comparison surface — sortable
 * columns, bulk selection, money you scan down a column. It is the wrong
 * answer for "find the company and open it", where it spends a header row and
 * six columns saying what one line of text would.
 */

export type RecordListFact = {
  /** Short label. Hidden on narrow screens where only the value fits. */
  label?: string;
  value: ReactNode;
  /**
   * What the value is — an email, a phone number, a figure. Decides the ink
   * and the face through the same resolver the table uses, so a person's email
   * is the same blue whichever arrangement you happen to be looking at. Left
   * off, the fact stays plain body text.
   */
  kind?: RecordCellKind;
  /** Numerals line up when this is set — codes, money, counts. */
  mono?: boolean;
  /**
   * The one fact worth keeping when the row has no room for labels — a deal's
   * value, an invoice's balance. A phone shows this and nothing else.
   *
   * Left off on purpose for counts and owners: stripped of its label, "Deals:
   * 0" renders as a bare "0" at the end of a person's name, which reads as a
   * figure about them without saying which. A row that says less is better
   * than one that says something ambiguous.
   */
  primary?: boolean;
};

export type RecordListRow = {
  id: string;
  href: string;
  title: ReactNode;
  /** One line under the title: the thing that tells two similar rows apart. */
  subtitle?: ReactNode;
  /** Leading avatar, icon or initials. */
  leading?: ReactNode;
  /** Status chip or badge, shown beside the title. */
  status?: ReactNode;
  /** Up to three facts, right-aligned. Dropped below `sm`. */
  facts?: RecordListFact[];
  /** Row-level actions. Rendered outside the link so they stay clickable. */
  actions?: ReactNode;
};

export function RecordList({
  rows,
  isLoading,
  emptyTitle = "Nothing here yet",
  emptyBody,
  emptyAction,
  className,
  selection,
}: {
  rows: RecordListRow[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  className?: string;
  /**
   * Turns the list into something you can act on in bulk. Left off, the rows
   * stay plain links — most lists are read, not operated on, and a column of
   * checkboxes nobody uses is a column of noise.
   */
  selection?: {
    selectedIds: string[];
    onChange: (next: string[]) => void;
    /** The bar's buttons. Rendered beside the count once anything is picked. */
    actions?: (context: { ids: string[]; clear: () => void }) => ReactNode;
  };
}) {
  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />;
  }

  const selectedIds = selection?.selectedIds ?? [];
  const toggle = (id: string) =>
    selection?.onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((entry) => entry !== id)
        : [...selectedIds, id],
    );

  return (
    <>
    <ul
      // Space between rows, not rules. A divider draws a line the reader has
      // to cross for every row; a gap does the same separating without adding
      // anything to look at, and the rows stop reading as a ruled ledger.
      className={cn("space-y-1", className)}
    >
      {rows.map((row) => {
        const primaryFact = row.facts?.find((fact) => fact.primary);
        return (
        <li
          key={row.id}
          className={cn(
            "relative flex items-center gap-3 rounded-[var(--radius-md)] pr-3",
            selectedIds.includes(row.id) && "bg-[var(--surface-subtle)]",
          )}
        >
          {selection ? (
            <span className="flex-none pl-3">
              <Checkbox
                checked={selectedIds.includes(row.id)}
                onCheckedChange={() => toggle(row.id)}
                aria-label={`Select ${typeof row.title === "string" ? row.title : "this row"}`}
              />
            </span>
          ) : null}
          <Link
            href={row.href}
            className={cn(
              // `min-h-11` is the 44px touch target. `py-2.5` alone gives a
              // one-line row about 40px tall, which is under every platform's
              // minimum and reads as a near-miss rather than a miss.
              "group/row flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-md)] py-2.5 pr-3 hover:bg-[var(--surface-muted)]",
              selection ? "pl-2" : "pl-3",
            )}
          >
            {row.leading ? <span className="flex-none">{row.leading}</span> : null}

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                {/* The same cue EntityLink draws: a quiet underline that says
                    "this opens" without waiting for a hover to admit it. */}
                <span className="truncate text-sm font-medium text-[var(--text-strong)] underline decoration-[var(--border)] underline-offset-2 group-hover/row:decoration-[var(--text-muted)]">
                  {row.title}
                </span>
                {row.status}
              </span>
              {row.subtitle ? (
                <span className="mt-0.5 block truncate text-sm text-[var(--text-muted)]">
                  {row.subtitle}
                </span>
              ) : null}
            </span>

            {/* Facts are supporting detail, so they are the first thing to go
                when the row runs out of room. On a phone the one marked
                `primary` survives without its label — a value, a balance, the
                figure the row is about — and the rest go, because three
                labelled columns will not fit beside a title at 390px. A row
                with nothing marked shows no facts on a phone at all: an
                unlabelled number is worse than a missing one. */}
            {primaryFact ? (
              <span className="flex-none text-right text-sm sm:hidden">
                <RecordCell
                  kind={primaryFact.kind}
                  value={primaryFact.value}
                  linkify={false}
                  // Only where the fact has not said what it is. A `kind`
                  // already carries its own face, and `mono` on top of it
                  // would win the merge and undo the ink with it.
                  className={
                    primaryFact.kind
                      ? undefined
                      : cn(
                          "text-[var(--text-body)]",
                          primaryFact.mono && "font-mono tabular-nums",
                        )
                  }
                />
              </span>
            ) : null}

            {row.facts?.length ? (
              <span className="hidden flex-none items-center gap-6 sm:flex">
                {row.facts.map((fact, index) => (
                  <span key={index} className="text-right">
                    {fact.label ? (
                      <span className="block text-sm font-medium text-[var(--text-subtle)]">
                        {fact.label}
                      </span>
                    ) : null}
                    <span className="block text-sm">
                      <RecordCell
                        kind={fact.kind}
                        value={fact.value}
                        linkify={false}
                        className={
                          fact.kind
                            ? undefined
                            : cn(
                                "text-[var(--text-body)]",
                                fact.mono && "font-mono tabular-nums",
                              )
                        }
                      />
                    </span>
                  </span>
                ))}
              </span>
            ) : null}

            <ChevronRight className="size-4 flex-none text-[var(--text-subtle)]" />
          </Link>

          {row.actions ? <span className="flex-none">{row.actions}</span> : null}
        </li>
        );
      })}
    </ul>

    {selection && selectedIds.length > 0 ? (
      <DataTableFloatingActions
        count={selectedIds.length}
        onClear={() => selection.onChange([])}
      >
        {selection.actions?.({
          ids: selectedIds,
          clear: () => selection.onChange([]),
        })}
      </DataTableFloatingActions>
    ) : null}
    </>
  );
}

/**
 * "Showing 20 of 340" plus a pair of page buttons.
 *
 * A list does not need a table's pagination bar — page size, jump-to-page and
 * a row-count select are controls for a grid you are working through, not a
 * list you are scanning.
 */
export function RecordListPager({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--text-muted)]">
        Showing <span className="font-mono">{from}</span>–<span className="font-mono">{to}</span> of{" "}
        <span className="font-mono">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
