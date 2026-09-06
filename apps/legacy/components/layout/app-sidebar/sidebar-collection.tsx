"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { MedusaChevronDownIcon, MedusaChevronRightIcon, Plus } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@corelithzw/ui/components/sidebar";

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
 * A named band of user-made things in the sidebar — saved views, lists,
 * whatever a person has pinned.
 *
 * Deliberately not the same shape as a nav section. A nav section is the
 * product's own structure and gets an icon and a row of its own; this is a
 * heading over things the user made, so it is a small label with a disclosure
 * and nothing else competing for the eye. The rows carry their own mark, which
 * is the point — a saved view is recognised by the thing the user gave it, not
 * by a generic glyph repeated down the column.
 *
 * Renders nothing when empty. An empty "Lists" heading is a promise the
 * sidebar cannot keep; the `+` lives on the heading, which only exists once
 * there is something to head.
 */
export function SidebarCollection({
  label,
  entries,
  activeHref,
  onCreate,
  createLabel,
  isCollapsed,
  emptyAction,
}: {
  label: string;
  entries: SidebarCollectionEntry[];
  activeHref: string | null;
  onCreate?: () => void;
  createLabel?: string;
  isCollapsed?: boolean;
  /** Shown in place of the rows when there are none but the band still matters. */
  emptyAction?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const { isMobile, setOpenMobile } = useSidebar();

  if (isCollapsed) return null;
  if (entries.length === 0 && !emptyAction) return null;

  return (
    <SidebarGroup className="space-y-0 py-0.5">
      <div className="flex items-center gap-1 px-2.5 py-1">
        <button
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center gap-1 rounded text-left text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
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
            className="flex size-6 flex-none items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--text)]"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <SidebarGroupContent className="mt-0">
          <SidebarMenu className="gap-0.5">
            {entries.map((entry) => (
              <SidebarMenuItem key={entry.id}>
                <SidebarMenuButton
                  asChild
                  size="sm"
                  isActive={entry.href === activeHref}
                  tooltip={entry.label}
                  className="h-9 px-2.5 lg:h-8"
                >
                  <Link
                    href={entry.href}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    <span className="flex size-4 flex-none items-center justify-center">
                      {entry.mark}
                    </span>
                    <span className="truncate">{entry.label}</span>
                    {entry.meta ? (
                      <span className="ml-auto shrink-0 text-sm text-[var(--text-subtle)]">
                        {entry.meta}
                      </span>
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            {entries.length === 0 ? (
              <li className={cn("px-2.5 py-1")}>{emptyAction}</li>
            ) : null}
          </SidebarMenu>
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  );
}
