"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The whole school's sheets and your own, as two segments of one screen.
 *
 * They were two rail entries — Results and Result sheets — over the same
 * table in the same five states. The only difference is the endpoint: one asks
 * for every sheet in the school, the other narrows to the assignments the
 * signed-in teacher actually takes. That is a cut of one list, not a second
 * destination, and a rail advertising both was advertising two doors onto one
 * room.
 *
 * So they stay two routes — a head of department working her own subjects
 * wants to send somebody that list, and a view held in `useState` has no
 * address to send — drawn as one segmented strip, with the rail lighting up
 * "Results" for both. The pattern is `library-views.tsx`, which settled it for
 * the shelves and the loans register.
 *
 * The state strip on each screen is a different control over a different axis
 * and both coexist: this one says *whose sheets*, that one says *how far along*.
 */

const SEGMENTS = [
  { href: "/schools/results", label: "The whole school" },
  { href: "/schools/results/sheets", label: "Yours" },
] as const;

export function ResultsViews({
  school,
  yours,
}: {
  /** Sheets in the school. Omitted where the screen has not counted them. */
  school?: number;
  /** Sheets the reader may work on. */
  yours?: number;
}) {
  const pathname = usePathname();
  const counts: Record<string, number | undefined> = {
    "/schools/results": school,
    "/schools/results/sheets": yours,
  };

  return (
    <div
      role="tablist"
      aria-label="Result sheets"
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
            {/* Only a number that is known. A count that is still loading
                renders as nothing rather than as a zero, because a zero that
                turns into 218 reads as data arriving late and wrong. */}
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
