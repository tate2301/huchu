"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Search, SlidersHorizontal } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * What a pinned control row looks like. One string because the tabs-and-filters
 * shape and the filters-only shape must pin identically — two copies drift and
 * the module ends up with two different hairlines.
 */
const STICKY_ROW =
  "sticky z-20 -mx-1 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-1 py-1.5";

/**
 * The controls that belong to the table underneath them.
 *
 * ## Two rows, not one
 *
 * ```
 *   [ tabs ]                                                        ← which population
 *   ────────────────────────────────────────────────────────────
 *   [ layout ] [ search ] [ filters … ]      50 of 214  [ actions ] ← how it is narrowed
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ table                                                    │
 * ```
 *
 * These were one row until it was pointed out that they are two different
 * questions and people do not ask them at once. A tab picks **which records
 * exist** on this screen — allocations, or hostels, or the gate book. A filter
 * narrows **the set the tab chose**. The second only means anything once the
 * first is answered, so it sits underneath it: the reading order is the
 * thinking order.
 *
 * Run together they read as one undifferentiated strip of controls, and the
 * strip's leftmost item — a segmented tab, which navigates — looks like a
 * sibling of the chips beside it, which do not. Two rows say which of these
 * changes the page and which changes the rows.
 *
 * Within the second row the order still holds: *how is it arranged*, then *how
 * is it narrowed*, then *how do I find one*. The layout switch leads because it
 * is the one control whose answer changes what the others mean.
 *
 * The count sits on the filter row, not above with the tabs, and that is the
 * same rule again: it moves when the filters move, so it is the answer to the
 * question that row just asked and it belongs beside the question.
 *
 * ## Nothing above this row but the page's name
 *
 * There is no band of summary chips over these controls. A working screen — one
 * whose job is a table you narrow — shows the table and what narrows it, and
 * nothing else. Totals belong on the module's overview dashboard, where
 * summarising *is* the job. See `docs/design-system/09-campus-canvas-law.md` §2.
 *
 * Everything is optional. With one child this is a plain row.
 *
 * ## On a phone the row is not a row
 *
 * Five controls at 32px wrap onto four lines and push the records themselves
 * below the fold, so the reader reads five labels before they can look at
 * anything. Below `sm` the filters go behind one button and what stays on
 * screen is what somebody came for: the search box, and the records under it.
 * The button carries the active count — a collapsed control that hides a
 * filter in force is how a list ends up looking empty for no visible reason.
 */
export function TableControls({
  layout,
  tabs,
  search,
  filters,
  filterCount,
  count,
  actions,
  sticky = false,
  className,
}: {
  /**
   * How the same records are arranged — table, list, board. Leftmost, always,
   * whatever else the screen passes.
   */
  layout?: ReactNode;
  /** Segmented views of the same rows — "All 879", "Active 842", "Boarders 218". */
  tabs?: ReactNode;
  /** The search box. Use `TableSearch` unless the screen needs something odd. */
  search?: ReactNode;
  /** Filter chips — `FilterSelect`, usually a class or a term. */
  filters?: ReactNode;
  /**
   * How many of those filters are narrowing anything. Shown on the phone
   * trigger, where the filters themselves are out of sight. `activeFilterCount`
   * in `filter-select.tsx` counts it.
   */
  filterCount?: number;
  /** "50 of 214" — how many are showing, out of how many. */
  count?: ReactNode;
  /** Verbs that act on the table as a whole: Export, Print. NOT the page's
   *  primary action, which belongs in the app bar. */
  actions?: ReactNode;
  /**
   * Pin the row under the page band.
   *
   * Only on a page whose shell publishes `--stack-top` as the height of the
   * band above it. Pinned at a guessed offset the row does not fail
   * loudly — it slides under the band and takes the records with it.
   */
  sticky?: boolean;
  className?: string;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterRow = (
    <div
      className={cn(
        // `items-end` so a labelled search box and an unlabelled filter chip
        // sit on the same baseline — 14 screens give their search box a label
        // and `items-center` would float the chips half a label high.
        "flex flex-wrap items-end gap-2",
        // Only the filter row pins when there are no tabs. With tabs the
        // wrapper below owns the sticky, or the two rows pin to the same
        // offset and the tabs slide under the filters.
        sticky && !tabs && STICKY_ROW,
      )}
      style={sticky && !tabs ? { top: "var(--stack-top, 0px)" } : undefined}
    >
      {layout}
      {search}

      {/* From `sm`, the filters are in the row. Below it they are behind the
          button beside the search box. Two renderings rather than one moved
          element, because a `Select` that is unmounted mid-interaction leaves
          its popover orphaned. */}
      {filters ? (
        <div className="hidden flex-wrap items-end gap-2 sm:flex">{filters}</div>
      ) : null}

      {filters ? (
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger asChild>
            <Button
              variant={filterCount ? "default" : "outline"}
              size="sm"
              className="shrink-0 sm:hidden"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {filterCount ? `Filters (${filterCount})` : "Filters"}
            </Button>
          </SheetTrigger>
          {/* A sheet rather than a menu: these controls are themselves
              popovers, and a menu that closes the moment one of them opens is
              a menu you cannot use. Bottom-anchored, which is where a thumb
              is. */}
          <SheetContent side="bottom" size="md" className="p-4 sm:hidden">
            <SheetHeader className="pb-3 text-left">
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            {/* Stacked and full width — one line each, which is the only way a
                nine-option filter reads on a phone. */}
            <div className="stacked-controls flex flex-col items-stretch gap-2">
              {filters}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {count ? (
        <span className="ml-auto hidden shrink-0 self-center font-mono text-xs tabular-nums text-[color:var(--text-subtle)] sm:inline">
          {count}
        </span>
      ) : null}

      {actions ? (
        <div className={cn("flex items-center gap-2 self-end", count ? "" : "ml-auto")}>
          {actions}
        </div>
      ) : null}
    </div>
  );

  // No tabs, no wrapper. A screen with one population is one row of controls,
  // and a stacking container around a single child is a container that only
  // shows up in the box model.
  if (!tabs) {
    return className ? <div className={className}>{filterRow}</div> : filterRow;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        sticky && STICKY_ROW,
        className,
      )}
      style={sticky ? { top: "var(--stack-top, 0px)" } : undefined}
    >
      {/* The tabs get their own line and their own hairline. The rule beneath
          them is what says the controls below belong to the table rather than
          to the tab strip — without it the two rows read as one block that
          happens to have wrapped. */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[color:var(--border)] pb-2">
        {tabs}
      </div>
      {filterRow}
    </div>
  );
}

/**
 * The search box for a table.
 *
 * Bordered and labelled — the opposite of the app bar's ghost trigger, and
 * deliberately so. That one opens a dialog that searches the whole product;
 * this one filters the rows in front of you. Making them look alike would be the
 * mistake.
 */
export function TableSearch({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Name what it searches: "Search name or admission number". */
  placeholder: string;
  /** Shown above the box. Omit on a screen whose only control this is. */
  label?: string;
  className?: string;
}) {
  const id = `table-search-${placeholder.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div className={cn("min-w-0 flex-1 basis-[240px] sm:max-w-[280px]", className)}>
      {label ? (
        <label htmlFor={id} className="text-sm text-muted-foreground">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-subtle)]"
          aria-hidden="true"
        />
        <Input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          className="pl-8 [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
    </div>
  );
}
