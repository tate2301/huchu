"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "next-auth/react";

import { ManagementShell } from "@/components/settings/management-shell";
import { ChevronRight } from "@/lib/icons";
import { getVisibleManagementAreaNavItems } from "@/lib/settings/management-nav";

/**
 * The area's front page: every reference set it holds, with the one line that
 * says what each is for.
 *
 * A list rather than a grid of cards. These are destinations you scan to find
 * one and open it — never figures you compare — so a row that is a mark, a
 * name and one supporting line says everything a card said in a third of the
 * height, and the whole row is the target. The mark is the rail's own icon, so
 * a set looks the same here as it does in the navigation beside it.
 */
export default function MasterDataOverviewPage() {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const visibleItems = useMemo(
    () =>
      getVisibleManagementAreaNavItems("master-data", enabledFeatures).filter(
        (item) => item.id !== "overview",
      ),
    [enabledFeatures],
  );

  return (
    <ManagementShell
      area="master-data"
      title="Overview"
      description="the reference data every other module is filed against"
    >
      {/* Separated by space rather than by rules: a divider draws a line the
          reader has to cross for every row, and a gap separates just as well
          without adding anything to look at. */}
      <ul className="space-y-1">
        {visibleItems.map((entry) => {
          const Icon = entry.icon;
          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface)] px-3 py-2 no-underline transition-colors hover:border-[color:var(--border)] hover:bg-[color:var(--surface-subtle)]"
              >
                {Icon ? (
                  <Icon
                    className="size-4 shrink-0 text-[color:var(--text-faint)]"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[color:var(--text-strong)]">
                    {entry.label}
                  </span>
                  {/* Nothing is rendered where a set has no lede, rather than an
                      empty line — a row with a hole in it reads as a row that
                      failed to load. */}
                  {entry.description ? (
                    <span className="block truncate text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                      {entry.description}
                    </span>
                  ) : null}
                </span>
                {/* The row is a long way across on a wide screen, and without
                    something at the far end nothing there says it opens. */}
                <ChevronRight
                  className="size-4 shrink-0 text-[color:var(--text-faint)]"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </ManagementShell>
  );
}
