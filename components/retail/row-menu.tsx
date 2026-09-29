"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DotsThree } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  /** Drawn last, under a rule, in the danger ink. */
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * A row's verbs, behind one icon (DENS-2).
 *
 * A table whose rows each spell out Edit, Save and Remove is a column of
 * buttons with the records squeezed between them. The row keeps one quiet
 * mark at its right-hand end and the verbs live behind it; the one that
 * destroys is set apart at the bottom.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const safe = items.filter((item) => !item.destructive);
  const risky = items.filter((item) => item.destructive);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)]",
            "hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]",
          )}
        >
          <DotsThree className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {safe.map((item) => (
          <DropdownMenuItem key={item.label} disabled={item.disabled} onSelect={item.onSelect}>
            {item.label}
          </DropdownMenuItem>
        ))}
        {safe.length > 0 && risky.length > 0 ? <DropdownMenuSeparator /> : null}
        {risky.map((item) => (
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabled}
            onSelect={item.onSelect}
            className="text-[var(--tone-danger-strong)]"
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
