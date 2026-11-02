"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { DotsThree, Plus } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type BoardColumnAction = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

/**
 * The head of a board column, sitting inside the column's tray.
 *
 * Name and count on the first line, the column's total under the name on the
 * second. A total squeezed onto the same line as the name truncated the name
 * first, and the name is the thing you scan a board by.
 *
 * The add button is here rather than at the foot of the column because on a
 * full column the foot is off screen, and "put a new one in this stage" is a
 * thing you decide from the header you just read.
 */
export function BoardColumnHeader({
  id,
  name,
  dot,
  count,
  total,
  onAdd,
  addLabel,
  actions,
}: {
  /** The heading's id, which labels the column and its list. */
  id: string;
  name: string;
  /** Tailwind background class for the column's dot. */
  dot: string;
  count: number;
  /** The column's total, already formatted. */
  total?: string;
  onAdd?: () => void;
  addLabel?: string;
  actions?: BoardColumnAction[];
}) {
  return (
    <header className="group/head flex flex-none items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-ground)] px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden="true" className={cn("size-2 flex-none rounded-full", dot)} />
        <h3 id={id} className="min-w-0 truncate text-sm font-medium text-[var(--color-ink)]">
          {name}
        </h3>
        <span className="flex-none font-mono text-sm tabular-nums text-[var(--color-muted)]">
          {count}
        </span>
      </div>

      <div className="flex flex-none items-center gap-1.5">
        {total ? (
          <span className="font-mono text-sm tabular-nums text-[var(--color-sub)]">
            {total}
          </span>
        ) : null}
        {onAdd ? (
          <IconButton
            size="sm"
            onClick={onAdd}
            aria-label={addLabel ?? `Add to ${name}`}
            className="opacity-0 focus-visible:opacity-100 group-hover/head:opacity-100 pointer-coarse:opacity-100"
          >
            <Plus />
          </IconButton>
        ) : null}

        {actions && actions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                size="sm"
                aria-label={`Options for ${name}`}
                className="opacity-0 focus-visible:opacity-100 group-hover/head:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
              >
                <DotsThree />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.label}
                  onSelect={action.onSelect}
                  className={
                    action.destructive ? "text-[var(--status-error-text)]" : undefined
                  }
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}
