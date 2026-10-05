"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { MedusaChevronDownIcon, MedusaChevronRightIcon, Plus } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useShell } from "@/components/layout/shell-state";

export type SidebarCollectionEntry = {
  id: string;
  href: string;
  label: string;
  /** An emoji, a coloured square, an avatar — whatever stands for this row. */
  mark?: ReactNode;
  /** Quiet trailing text: what kind of thing this is, how many are in it. */
  meta?: string;
};

/**
 * A named band of user-made things under the module panel's items — saved
 * views, groups: the module's own extra section (00-foundations 5.3.3).
 *
 * A small label with a disclosure and nothing else competing for the eye; the
 * rows carry their own mark. Renders nothing when empty unless the band still
 * matters (`emptyAction`).
 */
export function SidebarCollection({
  label,
  entries,
  activeHref,
  onCreate,
  createLabel,
  emptyAction,
}: {
  label: string;
  entries: SidebarCollectionEntry[];
  activeHref: string | null;
  onCreate?: () => void;
  createLabel?: string;
  /** Shown in place of the rows when there are none but the band still matters. */
  emptyAction?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const { setDrawerOpen } = useShell();

  if (entries.length === 0 && !emptyAction) return null;

  return (
    <div className="pt-2">
      <div className="flex h-7 items-center gap-1 px-[10px]">
        <button
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          {isOpen ? (
            <MedusaChevronDownIcon className="size-3.5 flex-none" />
          ) : (
            <MedusaChevronRightIcon className="size-3.5 flex-none" />
          )}
          <span className="truncate">{label}</span>
        </button>
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            aria-label={createLabel ?? `New ${label}`}
            className="flex size-6 flex-none items-center justify-center rounded-[6px] text-[var(--ink-3)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {entries.map((entry) => {
            const current = entry.href === activeHref;
            return (
              <li key={entry.id}>
                <Link
                  href={entry.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setDrawerOpen(false)}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-[8px] px-[10px] text-[13px] text-[var(--ink)] hover:bg-[var(--active)]",
                    current && "bg-[var(--sel-fill)] font-semibold text-[var(--on-sel)] hover:bg-[var(--sel-fill)]",
                  )}
                >
                  <span className="flex size-4 flex-none items-center justify-center">{entry.mark}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.meta ? <span className="shrink-0 text-sm opacity-70">{entry.meta}</span> : null}
                </Link>
              </li>
            );
          })}
          {entries.length === 0 ? <li className="px-[10px] py-1">{emptyAction}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
