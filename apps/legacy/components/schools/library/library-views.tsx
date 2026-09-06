"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Shelves and Out, as two segments of one library.
 *
 * They are two routes rather than two pieces of component state, because a
 * librarian working the overdue list wants to send somebody that list — and a
 * view that lives in `useState` has no address to send. But they are not two
 * destinations either: the rail lights up "Library" for both, and the canvas
 * draws them as one segmented strip in the row above the rows they govern.
 *
 * So: links that look like segments. The count is optional, because each screen
 * only knows its own half without fetching the other one's data to fill in a
 * number nobody navigates by.
 */

const SEGMENTS = [
  { href: "/schools/library", label: "Shelves" },
  { href: "/schools/library/loans", label: "Out" },
] as const;

export function LibraryViews({
  shelves,
  out,
}: {
  /** How many titles are catalogued. Omitted where the screen has not asked. */
  shelves?: number;
  /** How many books are out. */
  out?: number;
}) {
  const pathname = usePathname();
  const counts: Record<string, number | undefined> = {
    "/schools/library": shelves,
    "/schools/library/loans": out,
  };

  return (
    <div
      role="tablist"
      aria-label="Library views"
      className="flex min-w-0 shrink-0 items-center gap-0.5 self-end rounded-[7px] bg-[var(--surface-sunken)] p-0.5"
    >
      {SEGMENTS.map((segment) => {
        const active = pathname === segment.href;
        const count = counts[segment.href];
        return (
          <Link
            key={segment.href}
            href={segment.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-sm transition-colors",
              active
                ? "bg-[var(--surface)] font-bold text-[var(--text-strong)] shadow-[0_1px_2px_rgba(22,24,29,.10)]"
                : "font-medium text-[var(--text-muted)] hover:text-[var(--text-strong)]",
            )}
          >
            <span>{segment.label}</span>
            {typeof count === "number" ? (
              <span
                className={cn(
                  "font-mono text-sm tabular-nums",
                  active ? "text-[var(--text-muted)]" : "text-[var(--text-subtle)]",
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
