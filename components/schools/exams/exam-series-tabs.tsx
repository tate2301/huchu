"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The four screens under one series.
 *
 * All four declare the same sidebar row — `Exam series` — so none of them adds
 * a destination of its own, and this is how a reader moves between them. It is
 * not a second navigation column: it belongs to the series, sits above its
 * content, and disappears when you leave.
 */
const TABS = [
  { segment: "candidates", label: "Candidates" },
  { segment: "entries", label: "Subject entries" },
  { segment: "seating", label: "Seating" },
  { segment: "results", label: "Results" },
] as const;

export function ExamSeriesTabs({ seriesId }: { seriesId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="This series" className="flex gap-1 border-b border-[color:var(--border-subtle)]">
      {TABS.map((tab) => {
        const href = `/schools/exams/${seriesId}/${tab.segment}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-1.5 text-[12.5px]",
              active
                ? "border-[color:var(--brand)] font-semibold text-[color:var(--text-strong)]"
                : "border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text-body)]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
