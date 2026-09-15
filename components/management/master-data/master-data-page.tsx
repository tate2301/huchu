"use client";

import { useMemo, useState, type ReactNode } from "react";

import { DataTable, type DataTableColumn } from "@corelithzw/react";
import { ManagementShell } from "@/components/settings/management-shell";
import type { ManagementArea } from "@/lib/settings/management-nav";
import {
  ListRowsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  TableRowsSkeleton,
  type SkeletonColumn,
} from "@/components/schools/common/states";
import { TableSearch } from "@/components/schools/common/table-controls";
import { ATTRIBUTE_ROW } from "@/components/records/record-attributes";
import { Button } from "@/components/ui/button";
import { Plus, Tag, X, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * A reference-data set: a register on the left, one record's detail on the
 * right, and the set's one verb in the page band.
 *
 * Every set page — job grades, sections, downtime codes, permits — had grown
 * the same page by hand: a shell, a spreadsheet-shaped table, and a pencil and
 * a bin squeezed into every row. Composed here instead, so a set page provides
 * only what is genuinely its own: columns, rows, a detail renderer, and its
 * create sheet.
 *
 * ## The set is named once
 *
 * The name, the lede and the create button are handed up to the band, which is
 * the one line on the page that never scrolls. They used to be drawn again
 * here, in a header of their own about sixty pixels below the bar that was
 * already showing the name — so the first row of data started below the fold
 * on a laptop and the reader had read the same four words three times.
 *
 * ## The empty state is not the loading state
 *
 * The table's body slot used to hold one centred sentence that said "Loading…"
 * or "Nothing here yet" depending on a flag. Those are three different facts —
 * the rows are coming, the narrowing hid them, or there are none — and each
 * wants its own answer. The wait is a skeleton of the row it is about to
 * become, so nothing moves when the data lands; the narrowing offers to undo
 * itself; and only the genuine emptiness offers the verb that fills it.
 */
export function MasterDataPage<Row>({
  area = "master-data",
  title,
  description,
  createLabel,
  onCreate,
  columns,
  data,
  rowKey,
  detailTitle,
  renderDetail,
  isLoading,
  error,
  search,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  filters,
  total,
  activeFilters,
  onClearNarrowing,
  emptyLabel,
  banner,
  children,
}: {
  /** Which management navigation group the shell highlights. */
  area?: ManagementArea;
  title: string;
  description?: string;
  createLabel?: string;
  onCreate?: () => void;
  columns: DataTableColumn<Row>[];
  data: Row[];
  rowKey: (row: Row) => string;
  /** Names the open record in the detail pane's header — its code, its name. */
  detailTitle?: (row: Row) => ReactNode;
  /**
   * The detail pane for a selected row. Receives a `close` callback so an
   * action that removes the row (delete) can also drop the pane showing it.
   */
  renderDetail: (row: Row, close: () => void) => ReactNode;
  isLoading?: boolean;
  error?: unknown;
  /**
   * A search box of the caller's own. Prefer `onSearchChange`: a set that
   * hands over the term gets the module's one search box, and a set that
   * builds its own is the third slightly different one.
   */
  search?: ReactNode;
  /** What is in the search box, so an emptied register can say what emptied it. */
  searchTerm?: string;
  /** Present, this draws the search box and owns its shape. */
  onSearchChange?: (value: string) => void;
  /** Name what it searches: "Search by code or name". */
  searchPlaceholder?: string;
  /** Filter controls, shown in the table toolbar beside search. */
  filters?: ReactNode;
  /**
   * How many records the set holds before narrowing. Gives the toolbar its
   * "8 of 12" — which belongs beside the controls that just asked the
   * question, not in the band, because it moves when they move.
   */
  total?: number;
  /** The filters in force, in the reader's words. */
  activeFilters?: string[];
  /** Undoes the narrowing above. Without it the empty state only explains. */
  onClearNarrowing?: () => void;
  /** The "nothing created yet" sentence, where the noun needs saying properly. */
  emptyLabel?: string;
  /** Rendered above the register — saved-record banners and the like. */
  banner?: ReactNode;
  /** Dialogs and sheets — mounted outside the register. */
  children?: ReactNode;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = data.find((row) => rowKey(row) === selectedKey) ?? null;
  const close = () => setSelectedKey(null);
  const noun = title.toLowerCase();

  /* A skeleton is only useful if it is the shape of what replaces it, so the
     column widths and the header labels come off the real columns rather than
     being restated — a set that adds a column cannot forget to add it here. */
  const skeletonColumns = useMemo<SkeletonColumn[]>(
    () =>
      columns.map((column) => ({
        width: typeof column.width === "number" ? column.width : undefined,
        align: column.align === "right" ? "right" : "left",
      })),
    [columns],
  );
  const skeletonHeaders = useMemo(
    () => columns.map((column) => (typeof column.header === "string" ? column.header : "")),
    [columns],
  );

  const typed = searchTerm?.trim() ?? "";
  const narrowed = typed.length > 0 || (activeFilters ?? []).length > 0;
  const clearNarrowing =
    onClearNarrowing ?? (onSearchChange && typed ? () => onSearchChange("") : undefined);
  const searchBox =
    onSearchChange !== undefined ? (
      <TableSearch
        value={searchTerm ?? ""}
        onChange={onSearchChange}
        placeholder={searchPlaceholder ?? `Search ${noun}`}
      />
    ) : (
      search
    );
  const countLabel =
    total && total > 0 && data.length !== total ? `${data.length} of ${total}` : null;

  const body = isLoading ? (
    <>
      {/* Two shapes, because the register is two shapes: a phone gets the list
          it is about to become and not a table's skeleton it never shows. */}
      <div className="hidden md:block">
        <TableRowsSkeleton
          columns={skeletonColumns}
          headers={skeletonHeaders}
          label={`Loading ${noun}`}
        />
      </div>
      <div className="md:hidden">
        <ListRowsSkeleton avatar={false} label={`Loading ${noun}`} />
      </div>
    </>
  ) : narrowed ? (
    <NothingMatched
      what={noun}
      search={searchTerm}
      filters={activeFilters}
      onClear={clearNarrowing}
    />
  ) : (
    <NothingYet
      title={emptyLabel ?? `No ${noun} yet`}
      action={
        createLabel && onCreate ? (
          <Button size="sm" onClick={onCreate}>
            {createLabel}
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <ManagementShell
      area={area}
      title={title}
      description={description}
      actions={
        createLabel && onCreate ? (
          <Button size="sm" className="gap-1.5" onClick={onCreate}>
            <Plus aria-hidden="true" className="size-3.5" />
            {createLabel}
          </Button>
        ) : undefined
      }
    >
      {banner}

      {/* The records stay visible under a failed refresh: what is on screen is
          still the last good answer, and taking it away to say so leaves the
          reader with less than they had. */}
      {error ? <LoadError what={`the ${noun}`} error={error} /> : null}

      <div
        className={cn(
          "grid items-start gap-5",
          selected && "lg:grid-cols-[minmax(0,1fr)_22rem]",
        )}
      >
        {/* The detail comes first on a narrow screen: picked from a register of
            four hundred rows, a pane appended below them is a pane nobody sees
            open. From `lg` it takes the right-hand column and pins there. */}
        <div className="order-2 min-w-0 lg:order-1">
          <DataTable<Row>
            columns={columns}
            data={data}
            rowKey={(row) => rowKey(row)}
            sortable
            toolbar={
              searchBox || filters || countLabel
                ? {
                    search: searchBox,
                    filters,
                    actions: countLabel ? (
                      <span className="font-mono text-xs tabular-nums text-[color:var(--text-subtle)]">
                        {countLabel}
                      </span>
                    ) : undefined,
                  }
                : undefined
            }
            emptyState={body}
            onRowClick={(row) => setSelectedKey(rowKey(row))}
          />
        </div>

        {selected ? (
          <aside
            aria-label="Record detail"
            className="order-1 overflow-clip rounded-[var(--card-radius)] border border-[color:var(--border)] bg-[color:var(--surface)] lg:sticky lg:order-2 lg:top-[calc(var(--stack-top,0px)+1rem)]"
          >
            <div className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-strong)]">
                {detailTitle?.(selected) ?? title}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-[var(--text-muted)]"
                aria-label="Close the detail pane"
                onClick={close}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <div className="p-4">{renderDetail(selected, close)}</div>
          </aside>
        ) : null}
      </div>

      {children}
    </ManagementShell>
  );
}

/**
 * One labelled fact in a detail pane.
 *
 * The record pages' property row, at the same measurements: a 112px label in
 * muted ink beside the value rather than stacked above it — the label is the
 * half you already know, and giving it a line of its own doubled the height of
 * a pane that is mostly one-word values. `items-start` so a value that wraps
 * hangs off its label instead of pushing the label into the middle of it, and
 * every row gets a mark, because a column where half the rows have a glyph and
 * the rest start at a ragged indent reads as a list that has gone wrong.
 */
export function DetailFact({
  label,
  icon: Icon = Tag,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={cn(
          "flex w-28 shrink-0 items-start gap-2 text-[var(--text-muted)]",
          ATTRIBUTE_ROW,
          "sm:text-[11.5px]",
        )}
      >
        <Icon className="mt-px size-4 shrink-0 text-[var(--text-faint)] sm:size-3.5" aria-hidden="true" />
        <span className="min-w-0">{label}</span>
      </span>
      {/* `block break-words`, not a flex child: a flex child will not wrap, and
          an email longer than the value column ran off the pane with no
          ellipsis and no way to read the rest. */}
      <span className={cn("block min-w-0 flex-1 break-words", ATTRIBUTE_ROW)}>{children}</span>
    </div>
  );
}
