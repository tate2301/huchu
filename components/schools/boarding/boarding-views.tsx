"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The boarding office, as six faces of one destination.
 *
 * The canvas draws them as a segmented strip in the control row of the
 * allocations board — `Allocations 344 · Hostels 4 · Leave and outings 11` —
 * and it is right to: a warden holding the bed list is one question away from
 * "and which house has space", one more from "who is in the building tonight",
 * and one more from "and who is out of the gate". Before this the faces lived
 * only in the rail, so moving between them meant leaving the row you were
 * reading.
 *
 * **Roll call and the sick bay are tabs, not tables on somebody else's page.**
 * That is §1 of the page law doing its work. Who is in the building tonight is
 * a different subject from who has which bed, and a screen that carried both
 * would have filters governing half of it and a row count counting half of it.
 * One click apart, each true to its name.
 *
 * They are links rather than view state, for the same reason `LibraryViews` is:
 * a warden who wants to send somebody the gate book needs the gate book to have
 * an address. The rail still lights up "Boarding" for all of them, so this
 * reads as one destination with several faces rather than several destinations.
 *
 * Every count is optional. A screen only knows the numbers it has already
 * fetched, and fetching the other five halves' data to fill in a badge nobody
 * navigates by would make each of these screens pay for the others.
 */

/*
  Seven faces, and two of them are about the same building on purpose.

  "Houses" is where the work happens — pick a house, see its plan, its boarders
  and who is in tonight. "Rooms and beds" is where a house is built: add a
  dormitory, number its beds, correct its properties. A warden opens the first
  every night and the second twice a year.

  The second used to be called "Hostels", which collided with the first the
  moment the rebuild added it — two segments a click apart, one named for the
  building and one named for the building. Naming it for what you go there to
  do is what tells them apart, and "house" is the word a Zimbabwean boarding
  school uses for the thing anyway.
*/
const SEGMENTS = [
  { href: "/schools/boarding", label: "Bed board" },
  { href: "/schools/boarding/allocations", label: "Allocations" },
  { href: "/schools/boarding/roll-call", label: "Roll call" },
  { href: "/schools/boarding/houses", label: "Houses" },
  { href: "/schools/boarding/hostels", label: "Rooms and beds" },
  { href: "/schools/boarding/sick-bay", label: "Sick bay" },
  { href: "/schools/boarding/leave", label: "Leave and outings" },
] as const;

export function BoardingViews({
  beds,
  allocations,
  hostels,
  rollCall,
  sickBay,
  leave,
}: {
  /** How many beds the school has, free and taken together. */
  beds?: number;
  /** Every allocation on the board, this term and the ones behind it. */
  allocations?: number;
  /** How many boarding houses the school has. */
  hostels?: number;
  /**
   * How many names are still to account for tonight, across the houses this
   * screen has read. Zero is worth showing — it is the number the roll call
   * exists to drive down, and a blank badge cannot say "done".
   */
  rollCall?: number;
  /** How many boarders are in the sick bay right now. */
  sickBay?: number;
  /** How many leave and outing requests are in the gate book. */
  leave?: number;
}) {
  const pathname = usePathname();
  const counts: Record<string, number | undefined> = {
    "/schools/boarding": beds,
    "/schools/boarding/allocations": allocations,
    "/schools/boarding/roll-call": rollCall,
    // The house count belongs to the screen you pick a house on. "Rooms and
    // beds" is about one house at a time and a count of houses would be
    // answering a question that screen does not ask.
    "/schools/boarding/houses": hostels,
    "/schools/boarding/sick-bay": sickBay,
    "/schools/boarding/leave": leave,
  };

  return (
    <div
      role="tablist"
      aria-label="Boarding views"
      className="flex min-w-0 shrink-0 items-center gap-0.5 self-end overflow-x-auto rounded-[7px] bg-[var(--surface-sunken)] p-0.5"
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
