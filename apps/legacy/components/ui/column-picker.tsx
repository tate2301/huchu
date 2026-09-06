"use client";

import * as React from "react";

import { Badge, Switch } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Eye, Search } from "@/lib/icons";
import type { ColumnOption, VisibleColumns } from "@/lib/ui/visible-columns";

/**
 * The one control that decides what a table or a board shows.
 *
 * Shared rather than per-surface because "which columns" is the same question
 * on a leads table, an invoice register and a kanban card, and three different
 * answers to it is three things to learn. It sits in the toolbar next to
 * filter and sort, which is where somebody looks for it — those three are one
 * family of "shape what I am looking at", and separating them puts a wall
 * between filtering rows and hiding columns that nobody thinks exists.
 */
export function ColumnPicker({
  columns,
  state,
  label = "Columns",
  /** Past this many, the popover grows a search box. */
  searchThreshold = 8,
}: {
  columns: ColumnOption[];
  state: VisibleColumns;
  label?: string;
  searchThreshold?: number;
}) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();

  const visible = needle
    ? columns.filter((column) => column.label.toLowerCase().includes(needle))
    : columns;

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* No size and no height class: the design system's default control
            height is what every other trigger in the toolbar is, and asking
            for `sm` and then forcing 36px back on top is how the row ended up
            with three different heights in it. */}
        <Button type="button" variant="outline">
          <Eye className="size-4" aria-hidden="true" />
          {label}
          {/* The count alone. "2 hidden" spelt out makes the trigger a
              sentence; a red-toned number reads as "attention: not seeing
              everything" at a glance. */}
          {state.hiddenCount > 0 ? (
            <Badge tone="danger" size="sm">
              {state.hiddenCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0">
        {columns.length > searchThreshold ? (
          <div className="relative border-b border-[var(--border-subtle)] p-2">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search columns"
              aria-label="Search columns"
              className="h-8 pl-8"
            />
          </div>
        ) : null}

        <ul className="max-h-72 overflow-y-auto p-1">
          {visible.map((column) => (
            <li key={column.id}>
              <label
                className={
                  column.required
                    ? "flex cursor-not-allowed items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 opacity-60"
                    : "flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--surface-subtle)]"
                }
              >
                <span className="min-w-0 truncate text-sm">{column.label}</span>
                <Switch
                  checked={state.isVisible(column.id)}
                  disabled={column.required}
                  onChange={() => state.toggle(column.id)}
                  aria-label={`Show ${column.label}`}
                />
              </label>
            </li>
          ))}

          {visible.length === 0 ? (
            <li className="px-2 py-3 text-center text-sm text-[var(--text-muted)]">
              No column matches that.
            </li>
          ) : null}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] p-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={state.showAll}>
            Show all
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={state.reset}>
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
