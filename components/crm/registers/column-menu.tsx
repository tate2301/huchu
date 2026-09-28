"use client";

import { useState, type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowDownward,
  ArrowUpward,
  Check,
  ChevronDown,
  EyeOff,
  Funnel,
  Rows,
  type LucideIcon,
} from "@/lib/icons";
import type { ColumnDef, ColumnKind, SortDir } from "@/lib/crm/registers/types";
import { cn } from "@/lib/utils";

import { FilterEditor } from "./filter-controls";
import type { RegisterHandle } from "./use-register";

/** A column's two orders, in the words its contents use. */
function sortWords(kind: ColumnKind): Record<SortDir, string> {
  switch (kind) {
    case "number":
    case "money":
    case "percent":
      return { asc: "Smallest first", desc: "Largest first" };
    case "date":
    case "datetime":
      return { asc: "Earliest first", desc: "Latest first" };
    default:
      return { asc: "A to Z", desc: "Z to A" };
  }
}

function MenuItem({
  icon: Icon,
  on,
  onSelect,
  children,
}: {
  icon: LucideIcon;
  /** A choice that is in force: ticked, and said so to a screen reader. */
  on?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={on}
      className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm text-[var(--text-strong)] hover:bg-[var(--surface-subtle)]"
    >
      <Icon className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {on ? <Check className="size-3.5 shrink-0 text-[var(--brand-strong)]" aria-hidden="true" /> : null}
    </button>
  );
}

/**
 * A column's own menu, opened from the caret in its header the way a
 * spreadsheet's column filter is: its two orders, its filter's answers right
 * there to tick, Group by when the list groups by it, and Hide.
 *
 * The header's name still sorts on a click. The menu is for everything
 * else, and it applies each choice at once, like the toolbar's chips.
 */
export function ColumnMenu({ register, column }: { register: RegisterHandle; column: ColumnDef }) {
  const [open, setOpen] = useState(false);
  const { def, state } = register;

  const filter = column.filter ? def.filters.find((candidate) => candidate.key === column.filter) : undefined;
  const filtered = filter ? state.filters[filter.key] !== undefined : false;
  const groupBy = filter ? def.groupBys?.find((option) => option.key === filter.key) : undefined;
  const hideable = !column.required;
  if (!column.sort && !filter && !hideable) return null;

  const current = state.sort ?? { key: def.sorts[0].key, dir: def.sorts[0].dir };
  const words = sortWords(column.kind);
  const sortBy = (dir: SortDir) => {
    register.setSort({ key: column.sort!, dir });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={filtered ? `${column.label}: filtered — sort, filter or hide` : `${column.label}: sort, filter or hide`}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-subtle)] transition-opacity hover:bg-[var(--surface-subtle)] hover:text-[var(--text-strong)] focus-visible:opacity-100",
            // A filtered column says so without being hovered, the way a
            // spreadsheet swaps the caret for a funnel.
            filtered || open ? "opacity-100" : "opacity-0 group-hover/head:opacity-100",
            filtered && "text-[var(--brand-strong)]",
          )}
        >
          {filtered ? (
            <Funnel className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {column.sort ? (
          <div role="group" aria-label="Sort" className="p-1">
            {(["asc", "desc"] as const).map((dir) => (
              <MenuItem
                key={dir}
                icon={dir === "asc" ? ArrowUpward : ArrowDownward}
                on={current.key === column.sort && current.dir === dir}
                onSelect={() => sortBy(dir)}
              >
                {words[dir]}
              </MenuItem>
            ))}
          </div>
        ) : null}

        {filter ? (
          <div className={cn(column.sort && "border-t border-[var(--border-subtle)]")}>
            <p className="acct-col-head px-3 pb-1 pt-2">Filter by {filter.label.toLowerCase()}</p>
            <FilterEditor register={register} filter={filter} open={open} />
            {filtered ? (
              <div className="p-1">
                <MenuItem icon={Funnel} onSelect={() => register.setFilter(filter.key, undefined)}>
                  Clear {filter.label.toLowerCase()}
                </MenuItem>
              </div>
            ) : null}
          </div>
        ) : null}

        {groupBy || hideable ? (
          <div className="border-t border-[var(--border-subtle)] p-1">
            {groupBy ? (
              <MenuItem
                icon={Rows}
                on={state.by === groupBy.key}
                onSelect={() => {
                  register.setBy(state.by === groupBy.key ? undefined : groupBy.key);
                  setOpen(false);
                }}
              >
                Group by {groupBy.label.toLowerCase()}
              </MenuItem>
            ) : null}
            {hideable ? (
              <MenuItem
                icon={EyeOff}
                onSelect={() => {
                  register.columns.toggle(column.id);
                  setOpen(false);
                }}
              >
                Hide column
              </MenuItem>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
