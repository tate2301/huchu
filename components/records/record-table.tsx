"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableFloatingActions } from "@/components/ui/data-table-floating-actions";
import { ArrowDownward, ArrowUpward, ChevronDown, ChevronRight, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The register view every module's record list is drawn with.
 *
 * It sits in `components/records` rather than under CRM or HR for the reason
 * `people-directory.tsx` gives: both modules draw the same table, and the
 * moment it lives in one of them the other becomes the copy that drifts. It
 * did live under `components/crm/records`, which left the HR directory
 * importing its cells out of the CRM module; every call site now imports it
 * from here.
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
 *   - one line per record, 36px on a mouse and 44 on a thumb, so the register
 *     is dense where it is read and reachable where it is tapped;
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
  /**
   * The sort this column's header sorts by, when it sorts. Clicking the
   * header sorts by it; clicking again turns the order round — the way a
   * spreadsheet's column head works.
   */
  sortKey?: string;
  cell: (row: T) => ReactNode;
};

/** The table's current order, and what to do when a sortable header is clicked. */
export type RecordTableSort = {
  key: string;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
};

/* ────────────────────────────────────────────────────────────────────────────
   What colour a cell is
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * What a value *is*, which is the only thing that decides how it is drawn.
 *
 * Not a status: a state gets a `Badge` or a `StatusChip` with a tone out of
 * `lib/crm/tones.ts`, because a state is a judgement and wants a filled shape.
 * These are the plain values either side of it.
 */
export type RecordCellKind =
  | "text"
  /** An address you can write to. */
  | "email"
  /** A number you can ring. */
  | "phone"
  /** Another record — a company, an owner, a deal. */
  | "relation"
  /** A reference, a national ID, an account number: read character by character. */
  | "code"
  /** A figure with a currency. */
  | "money"
  /** A count, a quantity, a percentage. */
  | "number"
  /** A date or a timestamp. */
  | "date";

/**
 * The one place a cell's ink and face are decided.
 *
 * The canvas colours a table per *value*, not per column — in People's
 * `renderVals()` an email is `#0944C2` and a missing one is `#A6AEBD`, decided
 * on the value itself rather than on which column it landed in. That is the
 * whole rule: the blue an email is set in is the same blue the info badge is
 * set in (`--brand-strong`, which `--badge-info-text` also resolves to), so a
 * table full of tinted values and a table full of badges agree with each other
 * instead of being two colour schemes stacked.
 *
 * Kept as one resolver rather than a `cn()` in each column definition because
 * four lists writing "which grey is a phone number" four times is four lists
 * that will eventually answer differently.
 */
export function recordCellTone(kind: RecordCellKind): string {
  switch (kind) {
    // The two things that are somewhere else: an address and a record. Both
    // are the info badge's ink, because both are the same promise.
    case "email":
    case "relation":
      return "text-[var(--brand-strong)]";
    // Identifiers are compared, not read. Mono is what lets the eye run down
    // the column and catch the one that differs by a digit.
    case "phone":
    case "code":
    case "date":
      return "font-mono tabular-nums text-[var(--text-body)]";
    // Money is the figure the row is about, so it carries the page's strongest
    // ink; a quantity beside it is not, and stays at body weight.
    case "money":
      return "font-mono tabular-nums font-medium text-[var(--text-strong)]";
    case "number":
      return "font-mono tabular-nums text-[var(--text-body)]";
    default:
      return "text-[var(--text-body)]";
  }
}

/** Figures hang off the right edge so their digits line up; prose does not. */
export function recordCellAlign(kind: RecordCellKind): "start" | "end" {
  return kind === "money" || kind === "number" ? "end" : "start";
}

/**
 * A value in a table cell, drawn to whatever it is.
 *
 * Three things it does that a bare `<span>` in a column definition does not.
 *
 * An address is a real `mailto:` and a relation is a real link, so the value
 * the canvas paints blue behaves like the thing the colour promises. Both stop
 * the click there: `RecordTable` leaves the rest of the row inert, but the row
 * lists and the boards wrap everything in one link, and an email inside one of
 * those would otherwise open the person rather than the mail client.
 *
 * A phone number is a `tel:` only where a tap on it could actually place a
 * call. On a mouse it stays plain text you can select and copy, which is what
 * it is for there — rendered as two elements swapped by a media query rather
 * than by a hook, because a hook per cell is five hundred `matchMedia`
 * listeners on a full page of records.
 *
 * And nothing is ever blank. An empty cell reads as a table that failed to
 * load; an em-dash in the faintest ink reads as "there is nothing here", which
 * is a fact worth having.
 */
export function RecordCell({
  kind = "text",
  value,
  href,
  linkify = true,
  className,
}: {
  kind?: RecordCellKind;
  value: ReactNode;
  /** Where a `relation` points. Ignored by every other kind. */
  href?: string | null;
  /**
   * Off where the cell is already inside a link — the row lists and the first
   * column of the table both wrap their contents in one. An anchor inside an
   * anchor is invalid markup and the browser closes the outer one early, which
   * silently costs the row the rest of its click target. The ink stays either
   * way, which is what the reader is actually being told.
   */
  linkify?: boolean;
  className?: string;
}) {
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const tone = cn("truncate", recordCellTone(kind), className);

  if (value === null || value === undefined || value === "" || value === false) {
    return (
      <span className={cn("text-[var(--text-faint)]", className)} title="Not set">
        —
      </span>
    );
  }

  if (kind === "email" && linkify && typeof value === "string") {
    return (
      <a href={`mailto:${value}`} onClick={stop} className={cn(tone, "block hover:underline")}>
        {value}
      </a>
    );
  }

  if (kind === "phone" && linkify && typeof value === "string") {
    const dial = value.replace(/[^\d+]/g, "");
    return (
      <span className={cn("block", tone)}>
        <a
          href={`tel:${dial}`}
          onClick={stop}
          className="hidden [@media(pointer:coarse)]:inline"
        >
          {value}
        </a>
        <span className="[@media(pointer:coarse)]:hidden">{value}</span>
      </span>
    );
  }

  if (kind === "relation" && linkify && href) {
    return (
      <Link href={href} onClick={stop} className={cn(tone, "block hover:underline")}>
        {value}
      </Link>
    );
  }

  return <span className={cn("block", tone)}>{value}</span>;
}

/**
 * One group of a grouped table: its heading, how many rows it holds across the
 * whole list — not only on this page — and which of these rows are in it.
 */
export type RecordTableGroup = { id: string; label: string; count: number; ids: readonly string[] };

export function RecordTable<T extends { id: string }>({
  rows,
  columns,
  rowHref,
  isLoading,
  emptyTitle = "Nothing here yet",
  emptyBody,
  emptyAction,
  selection,
  sort,
  mobile,
  groups,
  className,
}: {
  rows: T[];
  columns: RecordTableColumn<T>[];
  /** Makes headers with a `sortKey` sort the list. */
  sort?: RecordTableSort;
  /**
   * Where the first cell points. The rest of the row is inert on purpose.
   *
   * Left off — or null for a row — when a row is a line rather than a record:
   * a cost entry, a payment, a movement. Those have nothing of their own to
   * open, and a chevron that goes nowhere is a promise the table cannot keep,
   * so neither the link nor the chevron is drawn.
   */
  rowHref?: (row: T) => string | null;
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
  /**
   * Rows under group headings — "Rudo Moyo 14" — when the list is grouped
   * (SHAPE-13). The rows arrive in group order, because the server sorts by
   * the group first; each heading folds its rows away on this page.
   */
  groups?: readonly RecordTableGroup[] | null;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  className?: string;
  /**
   * Turns on the leading checkbox column. With `actions`, a floating bar
   * carries them; without, the page's own toolbar does (the CRM lists, whose
   * toolbar turns into the selection's actions rather than growing a bar).
   */
  selection?: {
    selectedIds: string[];
    onChange: (next: string[]) => void;
    actions?: (context: { ids: string[]; clear: () => void }) => ReactNode;
  };
}) {
  // Shift-click ticks everything between the last row ticked and this one, as
  // a spreadsheet selects a range. Kept across renders, reset by nothing: a
  // stale anchor just makes the next shift-click a single tick.
  const anchor = useRef<number | null>(null);
  const shift = useRef(false);
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());

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
            sort={sort}
            groups={groups}
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

  const toggle = (id: string, index: number) => {
    if (!selection) return;
    const on = !selectedIds.includes(id);
    if (shift.current && anchor.current !== null && anchor.current !== index) {
      const [from, to] = anchor.current < index ? [anchor.current, index] : [index, anchor.current];
      const range = rows.slice(from, to + 1).map((row) => row.id);
      selection.onChange(
        on ? [...new Set([...selectedIds, ...range])] : selectedIds.filter((entry) => !range.includes(entry)),
      );
    } else {
      selection.onChange(on ? [...selectedIds, id] : selectedIds.filter((entry) => entry !== id));
    }
    anchor.current = index;
  };

  const renderRow = (row: T, rowIndex: number) => {
    const selected = selectedIds.includes(row.id);
    const href = rowHref?.(row) ?? null;
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
              onClick={(event) => {
                shift.current = event.shiftKey;
              }}
              onCheckedChange={() => toggle(row.id, rowIndex)}
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
            {index === 0 && href ? (
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
                href={href}
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
          {href ? (
            <Link
              href={href}
              tabIndex={-1}
              aria-hidden="true"
              className="flex items-center justify-center"
            >
              <ChevronRight className="size-3.5 text-[var(--text-disabled)] group-hover/row:text-[var(--text-subtle)]" />
            </Link>
          ) : null}
        </td>
      </tr>
    );
  };

  // Consecutive rows of one group share a tbody under its heading. Without
  // groups the whole page is one run with no heading — the table as it was.
  const groupOf = new Map<string, RecordTableGroup>();
  for (const group of groups ?? []) for (const id of group.ids) groupOf.set(id, group);
  const runs: Array<{ key: string; group: RecordTableGroup | null; rows: Array<{ row: T; index: number }> }> = [];
  rows.forEach((row, index) => {
    const group = groups ? (groupOf.get(row.id) ?? null) : null;
    const last = runs[runs.length - 1];
    if (last && last.group?.id === group?.id) last.rows.push({ row, index });
    else runs.push({ key: `${group?.id ?? "rows"}-${index}`, group, rows: [{ row, index }] });
  });
  const columnCount = columns.length + (selection ? 2 : 1);
  const toggleFold = (id: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
      {/* The table reaches the frame.
          A register is read across, and a page gutter either side of it is
          16px of nothing on the one axis a wide table is short of — the
          artboards run the rules edge to edge and let the cells' own padding
          do the insetting. `table-edge-to-edge` also drops the max-width,
          which is what stops a list inheriting a cap meant for prose. */}
      <div className={cn("table-edge-to-edge @container", className)}>
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
                const sorted = sort && column.sortKey && sort.key === column.sortKey ? sort.dir : null;
                const SortArrow = sorted === "desc" ? ArrowDownward : ArrowUpward;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
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
                    {sort && column.sortKey ? (
                      <button
                        type="button"
                        onClick={() => sort.onSort(column.sortKey!)}
                        className={cn(
                          "group/sort -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-[var(--radius-sm)] px-1 uppercase hover:text-[var(--text-strong)]",
                          column.align === "end" && "justify-end",
                          sorted && "text-[var(--text-strong)]",
                        )}
                      >
                        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                        {column.label}
                        <SortArrow
                          className={cn(
                            "size-3 shrink-0",
                            sorted ? "opacity-100" : "opacity-0 group-hover/sort:opacity-50",
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "flex items-center gap-1.5",
                          column.align === "end" && "justify-end",
                        )}
                      >
                        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                        {column.label}
                      </span>
                    )}
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

          {runs.map((run) => {
            const isFolded = run.group ? folded.has(run.group.id) : false;
            return (
              <tbody key={run.key}>
                {run.group ? (
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={columnCount}
                      className="border-b border-[var(--table-divider)] bg-[var(--surface-subtle)] px-[13px] py-1.5 text-left"
                    >
                      <button
                        type="button"
                        onClick={() => toggleFold(run.group!.id)}
                        aria-expanded={!isFolded}
                        className="-mx-1 flex items-center gap-2 rounded-[var(--radius-sm)] px-1 text-sm font-medium text-[var(--text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      >
                        <ChevronDown
                          className={cn("size-3.5 text-[var(--text-subtle)] transition-transform", isFolded && "-rotate-90")}
                          aria-hidden="true"
                        />
                        <span>{run.group.label}</span>
                        <span className="font-mono font-normal tabular-nums text-[var(--text-subtle)]">
                          {run.group.count.toLocaleString("en-US")}
                        </span>
                      </button>
                    </th>
                  </tr>
                ) : null}
                {isFolded ? null : run.rows.map(({ row, index }) => renderRow(row, index))}
              </tbody>
            );
          })}
        </table>
        </div>
      </div>

      {selection?.actions && selectedIds.length > 0 ? (
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
