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
 * The controls that belong to the table underneath them.
 *
 * The rule, from the canvas: a table's own tabs, its search box and its filters
 * sit in ONE row directly above it. They are not screen furniture — they change
 * what that table shows and nothing else — so they travel with it rather than
 * being scattered between the page band and the card header.
 *
 * That matters because the band above is doing a different job. The band
 * carries state: how many are owing, how many registers are in. Those numbers
 * do not move when you type in the search box. Putting a filter up there says
 * it governs the page, and then a second table on the same screen makes a liar
 * of it.
 *
 * Composition, left to right:
 *
 *   [ layout ] [ tabs ]  [ search ] [ filters … ]  ··· 50 of 214  [ actions ]
 *
 * The order is doctrine rather than taste. *What am I looking at* — which
 * arrangement, then which population — comes before *how is it narrowed*,
 * which comes before *how do I find one*; everything after the slack is about
 * the table rather than about which records are in it. The layout switch leads
 * because it is the one control whose answer changes what all the others mean.
 *
 * The count belongs here and not in the page band, and that is the same rule
 * read the other way: it moves when the filters move, so it is not state — it
 * is the answer to the question they just asked, and it belongs next to the
 * question rather than at the foot of the table.
 *
 * Everything is optional. With one child this is a plain row; the layout only
 * earns its keep when a screen has three of the four and would otherwise
 * arrange them differently from the screen next door.
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
   * Only on a page inside `SchoolsPage`, which publishes `--stack-top` as the
   * height of the band above. Pinned at a guessed offset the row does not fail
   * loudly — it slides under the band and takes the records with it.
   */
  sticky?: boolean;
  className?: string;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div
      className={cn(
        // `items-end` so a labelled search box and an unlabelled filter chip
        // sit on the same baseline — 14 screens give their search box a label
        // and `items-center` would float the chips half a label high.
        "flex flex-wrap items-end gap-2",
        sticky &&
          "sticky z-20 -mx-1 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-1 py-1.5",
        className,
      )}
      style={sticky ? { top: "var(--stack-top, 0px)" } : undefined}
    >
      {layout}
      {tabs}
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
}

/**
 * The search box for a table.
 *
 * Bordered and labelled — the opposite of the app bar's ghost trigger, and
 * deliberately so. That one opens a dialog that searches the whole school; this
 * one filters the rows in front of you. Making them look alike would be the
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
