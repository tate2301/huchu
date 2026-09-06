"use client";

import type { Column } from "@tanstack/react-table";

import { cn } from "@/lib/utils";

/**
 * DataTableColumnHeader — the label inside a sortable `<th>`, and nothing else.
 *
 * The sort affordance moved onto the header cell itself: `.dtable thead
 * th.sortable::after` draws the caret and `.asc` / `.desc` swap its direction,
 * and `DataTable` puts the click / Enter / Space handler and `aria-sort` on the
 * `<th>`. A nested ghost `Button` plus an `ArrowUpward` / `ArrowDownward` icon
 * would now be a second, competing control inside an already-activatable cell,
 * so both are gone.
 *
 * `column` is retained in the props so the signature survives (call sites pass
 * it from `flexRender`), but nothing is read off it any more — TanStack's sort
 * state reaches the DOM through the `<th>` in `data-table.tsx`.
 */
type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
};

export function DataTableColumnHeader<TData, TValue>(
  props: DataTableColumnHeaderProps<TData, TValue>,
) {
  return <span className={cn(props.className)}>{props.title}</span>;
}
