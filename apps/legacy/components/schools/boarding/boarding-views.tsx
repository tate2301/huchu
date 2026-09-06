"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Allocations, Hostels and Leave / Outing Requests, as three segments of one
 * boarding office.
 *
 * The canvas draws them as a segmented strip in the control row of the
 * allocations board — `Allocations 344 · Hostels 4 · Leave / Outing Requests
 * 11` — and it is right to: a warden holding the bed list is one question away
 * from "and which house has space" and one more from "and who is out of the
 * gate". Before this the three lived only in the rail, so moving between them
 * meant leaving the row you were reading.
 *
 * They are links rather than view state, for the same reason `LibraryViews` is:
 * a warden who wants to send somebody the gate book needs the gate book to have
 * an address. The rail still lights up "Boarding" for all three, so this reads
 * as one destination with three faces rather than three destinations.
 *
 * Every count is optional. A screen only knows the numbers it has already
 * fetched, and fetching the other two halves' data to fill in a badge nobody
 * navigates by would make each of these screens pay for the other two.
 */

const SEGMENTS = [
  { href: "/schools/boarding/allocations", label: "Allocations" },
  { href: "/schools/boarding/hostels", label: "Hostels" },
  { href: "/schools/boarding/leave", label: "Leave / Outing Requests" },
] as const;

export function BoardingViews({
  allocations,
  hostels,
  leave,
}: {
  /** Every allocation on the board, this term and the ones behind it. */
  allocations?: number;
  /** How many boarding houses the school has. */
  hostels?: number;
  /** How many leave and outing requests are in the gate book. */
  leave?: number;
}) {
  const pathname = usePathname();
  const counts: Record<string, number | undefined> = {
    "/schools/boarding/allocations": allocations,
    "/schools/boarding/hostels": hostels,
    "/schools/boarding/leave": leave,
  };

  return (
    <div
      role="tablist"
      aria-label="Boarding views"
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
