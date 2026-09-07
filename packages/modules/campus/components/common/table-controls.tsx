"use client";

import type { ReactNode } from "react";

import { Input } from "@corelithzw/ui/components/input";
import { Search } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

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
 *   [ tabs ]   [ search ]  [ filters … ]        [ actions ]
 *
 * Everything is optional. With one child this is a plain row; the layout only
 * earns its keep when a screen has three of the four and would otherwise
 * arrange them differently from the screen next door.
 */
export function TableControls({
  tabs,
  search,
  filters,
  actions,
  className,
}: {
  /** Segmented views of the same rows — "All 879", "Active 842", "Boarders 218". */
  tabs?: ReactNode;
  /** The search box. Use `TableSearch` unless the screen needs something odd. */
  search?: ReactNode;
  /** Labelled dropdowns — `FilterSelect`, usually a class or a term. */
  filters?: ReactNode;
  /** Verbs that act on the table as a whole: Export, Print. NOT the page's
   *  primary action, which belongs in the app bar. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // `items-end` so a labelled filter and an unlabelled search box sit on
        // the same baseline — `FilterSelect` carries a label above its trigger
        // and `items-center` would float the search box half a label higher.
        "flex flex-wrap items-end gap-3",
        className,
      )}
    >
      {tabs}
      {search}
      {filters}
      {actions ? (
        <div className="ml-auto flex items-center gap-2 self-end">{actions}</div>
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
    <div className={cn("min-w-0 flex-1 basis-[260px] sm:max-w-[320px]", className)}>
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
