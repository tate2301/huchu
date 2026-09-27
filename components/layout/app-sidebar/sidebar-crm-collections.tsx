"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Kanban, ListBullets } from "@/lib/icons";
import { fetchCrmLists, fetchCrmSavedViews } from "@/lib/crm/collections-client";
import { groupHref } from "@/lib/crm/groups";
import { cn } from "@/lib/utils";

import { SidebarCollection, type SidebarCollectionEntry } from "./sidebar-collection";

// Loaded when somebody asks for it: the sidebar is on every page, and a
// dialog nobody has opened should not be in every page's bundle.
const NewGroupDialog = dynamic(
  () => import("@/components/crm/registers/group-dialog").then((module) => module.NewGroupDialog),
  { ssr: false },
);

const ENTITY_EMOJI: Record<string, string> = {
  LEAD: "✨",
  DEAL: "📈",
  PERSON: "🧑",
  COMPANY: "🏢",
  SITE: "📍",
  WORK_ORDER: "🛠️",
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
 * person keeps to hand. Both bands hide themselves when empty; a "Groups"
 * heading over nothing is a promise the sidebar cannot keep.
 *
 * Only rendered inside the CRM, where saved views and lists exist.
 */
export function SidebarCrmCollections({ isCollapsed }: { isCollapsed?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const inCrm = pathname === "/crm" || pathname.startsWith("/crm/");
  const [creatingGroup, setCreatingGroup] = useState(false);

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

  const groups = listsQuery.data?.data ?? [];
  const lists: SidebarCollectionEntry[] = groups.map((group) => ({
    id: group.id,
    href: groupHref(group.entity, group.id),
    label: group.name,
    mark: <span aria-hidden="true">{ENTITY_EMOJI[group.entity] ?? "📋"}</span>,
    meta: group._count?.members ? String(group._count.members) : undefined,
  }));
  // A group opens as its record type's list narrowed to it, so it is the one
  // being looked at when that list is narrowed to it.
  const activeGroup = groups.find((group) => {
    const href = groupHref(group.entity, group.id);
    const [path] = href.split("?");
    return path === pathname && (href.includes("?") ? searchParams.get("group") === group.id : true);
  });

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
        label="Groups"
        entries={lists}
        isCollapsed={isCollapsed}
        activeHref={activeGroup ? groupHref(activeGroup.entity, activeGroup.id) : null}
        createLabel="New group"
        onCreate={() => setCreatingGroup(true)}
      />

      {creatingGroup ? (
        <NewGroupDialog
          open={creatingGroup}
          onOpenChange={setCreatingGroup}
          onCreated={(group) => router.push(groupHref(group.entity, group.id))}
        />
      ) : null}
    </>
  );
}

export { ENTITY_HOME };
