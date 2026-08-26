"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableFloatingActions } from "@/components/ui/data-table-floating-actions";
import { ChevronRight, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The CRM's table view.
 *
 * A record list has always been rows you open — a title, a supporting line, a
 * fact or two on the right — and that is the right shape when you are looking
 * for one thing. It is the wrong shape when you are looking *across* things:
 * "which of these are unassigned", "who is on hold", "what is closing this
 * month". Those are column questions, and a stack of two-line rows cannot
 * answer them because the facts never line up.
 *
 * So the same records get a second arrangement rather than a second page. The
 * grammar is deliberately narrow and shared by every list in the module:
 *
 *   - one header row, quiet, with the column's own mark beside its name, so a
 *     scan down a column knows what it is looking at without reading the head;
 *   - one line per record, 44px, because a table you can also use with a thumb
 *     is worth more than one that fits six more rows;
 *   - the first column is the record, and it is the link. Nothing else in the
 *     row navigates, so a cell can hold a chip, an avatar or a figure without
 *     any of them becoming an accidental target.
 *
 * `DataTable` is still the right component for a grid you *work* — sorting,
 * grouping, expandable detail rows, column resizing. This is the presentation
 * half of that only, over data a parent already has, which is what lets people,
 * companies, sites and deals share one look for about twelve lines each.
 */

export type RecordTableColumn<T> = {
  id: string;
  label: string;
  /** The column's mark, beside its name in the header. */
  icon?: LucideIcon;
  /**
   * A fixed width, e.g. `"12rem"`. The first column is normally left to take
   * whatever is left over — it holds the name, which is the one thing worth
   * giving the slack to.
   */
  width?: string;
  /** Numbers and money hang off the right edge so their digits line up. */
  align?: "start" | "end";
  cell: (row: T) => ReactNode;
};

export function RecordTable<T extends { id: string }>({
  rows,
  columns,
  rowHref,
  isLoading,
  emptyTitle = "Nothing here yet",
  emptyBody,
  emptyAction,
  selection,
  mobile,
  className,
}: {
  rows: T[];
  columns: RecordTableColumn<T>[];
  /** Where the first cell points. The rest of the row is inert on purpose. */
  rowHref: (row: T) => string;
  /**
   * What a phone gets instead.
   *
   * Seven columns at 390px is a sideways scroll where every screen shows one
   * and a half of them, which is not a table — it is a table you have to
   * operate. So below `md` the same records come back as the rows the rest of
   * the module uses. Rendered here rather than at each call site because four
   * lists each remembering to do it is four lists where one of them forgets.
   */
  mobile?: ReactNode;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  className?: string;
  /** Turns on the leading checkbox column and the floating action bar. */
  selection?: {
    selectedIds: string[];
    onChange: (next: string[]) => void;
    actions?: (context: { ids: string[]; clear: () => void }) => ReactNode;
  };
}) {
  // Before the loading and empty branches, so a phone gets the row list's own
  // skeleton and empty state rather than the table's.
  if (mobile) {
    return (
      <>
        <div className="hidden md:block">
          <RecordTable
            rows={rows}
            columns={columns}
            rowHref={rowHref}
            isLoading={isLoading}
            emptyTitle={emptyTitle}
            emptyBody={emptyBody}
            emptyAction={emptyAction}
            selection={selection}
            className={className}
          />
        </div>
        <div className="md:hidden">{mobile}</div>
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-1.5" aria-busy="true" aria-live="polite">
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={36} />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />;
  }

  const selectedIds = selection?.selectedIds ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));

  const toggleAll = () =>
    selection?.onChange(
      allSelected
        ? selectedIds.filter((id) => !rows.some((row) => row.id === id))
        : [...new Set([...selectedIds, ...rows.map((row) => row.id)])],
    );

  const toggle = (id: string) =>
    selection?.onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((entry) => entry !== id)
        : [...selectedIds, id],
    );

  return (
    <>
      {/* The table scrolls sideways inside its own box rather than pushing the
          page wider. Seven columns do not fit a 1280px laptop once the sidebar
          has had its share, and a page that scrolls horizontally takes the
          toolbar and the app bar with it.
          ────────────────────────────────────────────────────────────────────
          …except where there is room, and then it must not, because of a rule
          that costs an hour to rediscover: an `overflow-x: auto` box computes
          `overflow-y` to `auto` as well, which makes it the scrolling ancestor
          for everything inside it. A `position: sticky` header then sticks to a
          box that never scrolls vertically — so it silently does nothing, and
          the header scrolls away with the rows.
          So the clamp is dropped once this element is wide enough to hold the
          table (46rem of columns, plus the name column's share), and only then
          is the header sticky against the page the way it looks like it should
          be. Narrower than that, the table scrolls and the header goes with it,
          which is the honest trade. */}
      <div className={cn("@container", className)}>
        <div className="overflow-x-auto @5xl:overflow-visible">
        {/* `border-separate` rather than `border-collapse`: a collapsed border
            is owned by the table, and a sticky header carries none of it with
            it — the head detaches and floats over the rows with no seam. */}
        <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {selection ? (
                <th
                  scope="col"
                  className="w-10 border-b border-[var(--border)] bg-[var(--table-header-bg)] px-2 py-1.5 @5xl:sticky @5xl:top-[var(--stack-top,0px)] @5xl:z-[2]"
                >
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label={allSelected ? "Clear selection" : "Select every row"}
                  />
                </th>
              ) : null}

              {columns.map((column) => {
                const Icon = column.icon;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    className={cn(
                      // Pinned at whatever offset the band stack has reached
                      // rather than at a hard-coded toolbar height. On a page
                      // with a band the stack publishes 44; inside a view
                      // switcher, 88 — and the header lands under whichever is
                      // actually above it instead of guessing.
                      //
                      // Only where the wrapper has dropped its overflow clamp.
                      // Inside a scroll container that never scrolls
                      // vertically, a `top` offset pins nothing — it just
                      // pushes the header down the page and leaves a band of
                      // nothing above it.
                      "border-b border-[var(--border)] bg-[var(--table-header-bg)] px-[13px] py-1.5 @5xl:sticky @5xl:top-[var(--stack-top,0px)] @5xl:z-[2]",
                      // The canvas column head is a label strip, not a row of
                      // prose: small, heavy, uppercase and letterspaced, so it
                      // reads as the table's chrome rather than as its first
                      // line of data.
                      "acct-col-head",
                      column.align === "end" && "text-right",
                    )}
                  >
                    <span
                      className={cn(
                        "flex items-center gap-1.5",
                        column.align === "end" && "justify-end",
                      )}
                    >
                      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                      {column.label}
                    </span>
                  </th>
                );
              })}

              {/* The chevron column. Unlabelled — it is an affordance, not a
                  field — but it still needs a header cell, or the body rows
                  carry one more cell than the head and every column below it
                  shifts by one. */}
              <th
                scope="col"
                className="w-10 border-b border-[var(--border)] bg-[var(--table-header-bg)] px-2 py-1.5 @5xl:sticky @5xl:top-[var(--stack-top,0px)] @5xl:z-[2]"
              >
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const selected = selectedIds.includes(row.id);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "group/row",
                    selected ? "bg-[var(--brand-tint)]" : "hover:bg-[var(--canvas)]",
                  )}
                >
                  {selection ? (
                    <td className="border-b border-[var(--table-divider)] px-2">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggle(row.id)}
                        aria-label="Select this row"
                      />
                    </td>
                  ) : null}

                  {columns.map((column, index) => (
                    <td
                      key={column.id}
                      className={cn(
                        // 36px on a mouse, 44 on a coarse pointer.
                        //
                        // The canvas runs these lists at 36px — four more rows
                        // per screen on a register somebody scans all day. A
                        // 36px row is still a comfortable mouse target and a
                        // poor thumb one, so the row grows back on touch,
                        // where the extra height buys a hit area rather than
                        // costing a row.
                        "min-h-[var(--table-row-min-h)] border-b border-[var(--table-divider)] px-[13px] py-1.5 align-middle text-sm",
                        "[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:py-2.5",
                        column.align === "end" && "text-right",
                      )}
                    >
                      {index === 0 ? (
                        // Only the first cell navigates. A row where every cell
                        // is inside the link is a row where you cannot select
                        // the text in it, and where a chip in the third column
                        // is a link that does not look like one.
                        // The link carries no underline of its own. A text
                        // decoration is painted by the element that declares
                        // it and cannot be switched off by a descendant, so an
                        // underline here struck through the job title and the
                        // reference under every name — `no-underline` on the
                        // subtitle does nothing about it. `RecordTableName`
                        // underlines the title itself instead.
                        <Link
                          href={rowHref(row)}
                          className="-mx-1 block min-w-0 rounded-[var(--radius-sm)] px-1"
                        >
                          {column.cell(row)}
                        </Link>
                      ) : (
                        column.cell(row)
                      )}
                    </td>
                  ))}

                  {/* "This row opens."

                      The first cell is the link and the rest of the row is
                      inert, which is the right trade — but it left a table
                      where nothing at the end of a 46rem row said there was
                      anywhere to go. The artboards close the row with a
                      chevron, and it is a link to the same place rather than
                      decoration, so a reader who has scanned across to the
                      last column does not have to scan back. */}
                  <td className="border-b border-[var(--table-divider)] px-2 py-1.5 align-middle">
                    <Link
                      href={rowHref(row)}
                      tabIndex={-1}
                      aria-hidden="true"
                      className="flex items-center justify-center"
                    >
                      <ChevronRight className="size-3.5 text-[var(--text-disabled)] group-hover/row:text-[var(--text-subtle)]" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {selection && selectedIds.length > 0 ? (
        <DataTableFloatingActions
          count={selectedIds.length}
          onClear={() => selection.onChange([])}
        >
          {selection.actions?.({ ids: selectedIds, clear: () => selection.onChange([]) })}
        </DataTableFloatingActions>
      ) : null}
    </>
  );
}

/**
 * The name cell every list's first column is built from.
 *
 * Two lines: what the record is called, and the one thing that tells two
 * similarly-named records apart — a reference, a company, a town. Sharing it
 * is what stops four lists growing four slightly different first columns.
 */
export function RecordTableName({
  leading,
  title,
  subtitle,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {leading ? <span className="flex-none">{leading}</span> : null}
      <span className="min-w-0">
        {/* The underline is on the title and nowhere else — the same quiet
            "this opens" cue `EntityLink` draws, and the only part of the cell
            that actually is the link's subject. */}
        <span className="block truncate font-semibold text-[var(--text-strong)] underline decoration-[var(--border)] underline-offset-2 group-hover/row:decoration-[var(--text-muted)]">
          {title}
        </span>
        {/* Mono, and a step down.

            The subtitle is nearly always an identifier — a reference, a code,
            a phone number, a branch — and setting identifiers in mono is what
            lets the eye run down the column and spot the one that differs.
            At the same size and face as the title it read as a second name
            and doubled the apparent height of every row. */}
        {subtitle ? (
          <span className="acct-caption block truncate font-mono">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}
