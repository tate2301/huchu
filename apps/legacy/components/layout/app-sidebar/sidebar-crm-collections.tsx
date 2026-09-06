"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Kanban, ListBullets } from "@corelithzw/ui/lib/icons";
import { fetchCrmLists, fetchCrmSavedViews } from "@/lib/crm/collections-client";
import { cn } from "@corelithzw/ui/lib/utils";

import { SidebarCollection, type SidebarCollectionEntry } from "./sidebar-collection";

const ENTITY_EMOJI: Record<string, string> = {
  LEAD: "✨",
  DEAL: "📈",
  PERSON: "🧑",
  COMPANY: "🏢",
  SITE: "📍",
};

/** The list's home page, chosen by what kind of record it holds. */
const ENTITY_HOME: Record<string, string> = {
  LEAD: "/crm/leads",
  DEAL: "/crm/deals",
  PERSON: "/crm/people",
  COMPANY: "/crm/companies",
  SITE: "/crm/sites",
};

function LayoutMark({ layout }: { layout: "TABLE" | "BOARD" }) {
  const Icon = layout === "BOARD" ? Kanban : ListBullets;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-4 items-center justify-center rounded-[var(--radius-sm)] text-white",
        layout === "BOARD" ? "bg-[var(--tone-danger)]" : "bg-[var(--tone-success)]",
      )}
    >
      <Icon className="size-3" />
    </span>
  );
}

/**
 * The user's own shelves in the sidebar: the views they have saved and the
 * lists they have built.
 *
 * These sit below the product's own navigation rather than inside it, because
 * they are not part of the app's structure — they are what this particular
 * person keeps to hand. Both bands hide themselves when empty; a "Lists"
 * heading over nothing is a promise the sidebar cannot keep.
 *
 * Only rendered inside the CRM, where saved views and lists exist.
 */
export function SidebarCrmCollections({ isCollapsed }: { isCollapsed?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const inCrm = pathname === "/crm" || pathname.startsWith("/crm/");

  const viewsQuery = useQuery({
    queryKey: ["crm", "saved-views"],
    queryFn: () => fetchCrmSavedViews(),
    enabled: inCrm,
    staleTime: 5 * 60_000,
  });

  const listsQuery = useQuery({
    queryKey: ["crm", "lists"],
    queryFn: () => fetchCrmLists(),
    enabled: inCrm,
    staleTime: 5 * 60_000,
  });

  if (!inCrm) return null;

  const activeViewId = searchParams.get("savedView");
  const views: SidebarCollectionEntry[] = (viewsQuery.data?.data ?? []).map((view) => ({
    id: view.id,
    href: `/crm/leads?savedView=${view.id}`,
    label: view.name,
    mark: <LayoutMark layout={view.viewType} />,
    meta: view.isShared ? "shared" : undefined,
  }));

  const lists: SidebarCollectionEntry[] = (listsQuery.data?.data ?? []).map((list) => ({
    id: list.id,
    href: `/crm/lists/${list.id}`,
    label: list.name,
    mark: <span aria-hidden="true">{ENTITY_EMOJI[list.entity] ?? "📋"}</span>,
    meta: list._count?.members ? String(list._count.members) : undefined,
  }));

  return (
    <>
      <SidebarCollection
        label="Pinned views"
        entries={views}
        isCollapsed={isCollapsed}
        // A view is identified by its id in the query string, not by the path
        // — every one of them lives at /crm/leads. `savedView`, not `view`,
        // because `view` already says table or board.
        activeHref={activeViewId ? `/crm/leads?savedView=${activeViewId}` : null}
      />

      <SidebarCollection
        label="Lists"
        entries={lists}
        isCollapsed={isCollapsed}
        activeHref={pathname}
        createLabel="New list"
        onCreate={() => router.push("/crm/lists?new=1")}
      />
    </>
  );
}

export { ENTITY_HOME };
