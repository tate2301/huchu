"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Plus } from "@/lib/icons";
import { fetchCrmLists, fetchCrmSavedViews } from "@/lib/crm/collections-client";
import { groupHref } from "@/lib/crm/groups";
import { registerHref } from "@/lib/crm/registers/href";
import { isEngineRegisterKey } from "@/lib/crm/registers/registry";
import { orderRows } from "@/lib/rail/order";

import { SidebarCollection, type SidebarCollectionEntry } from "./sidebar-collection";

// Loaded when somebody asks for it: the sidebar is on every page, and a
// dialog nobody has opened should not be in every page's bundle.
const NewGroupDialog = dynamic(
  () => import("@/components/crm/registers/group-dialog").then((module) => module.NewGroupDialog),
  { ssr: false },
);

/** What kind of record a group holds, or a saved view lists. */
const ENTITY_EMOJI: Record<string, string> = {
  LEAD: "✨",
  DEAL: "📈",
  PERSON: "🧑",
  COMPANY: "🏢",
  SITE: "📍",
  WORK_ORDER: "🛠️",
};

/**
 * The user's own shelves in the sidebar: the views they have saved and the
 * groups they have built.
 *
 * These sit below the product's own navigation rather than inside it, because
 * they are not part of the app's structure — they are what this particular
 * person keeps to hand. Saved views hide themselves when there are none: one
 * is made from a list's Views menu, where the list it keeps is on screen.
 * Groups do not: with none yet the band is where a first one is made, and a
 * feature that only appears once it has been used is one nobody finds.
 *
 * Only rendered inside the CRM, where saved views and groups exist.
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

  // Each view opens on its own list, as it was saved.
  const saved = orderRows(viewsQuery.data?.data ?? [], { label: (view) => view.name }).flatMap((view) =>
    isEngineRegisterKey(view.register) ? [{ ...view, href: registerHref(view.register, {}, { view: view.id }) }] : [],
  );
  const views: SidebarCollectionEntry[] = saved.map((view) => ({
    id: view.id,
    href: view.href,
    label: view.name,
    mark: <span aria-hidden="true">{ENTITY_EMOJI[view.register] ?? "📋"}</span>,
    meta: view.isShared ? "shared" : undefined,
  }));
  // The view being looked at: its list, naming it — changed since or not.
  const activeView = saved.find(
    (view) => view.href.split("?")[0] === pathname && searchParams.get("view") === view.id,
  );

  const groups = orderRows(listsQuery.data?.data ?? [], { label: (group) => group.name });
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
        label="Saved views"
        entries={views}
        isCollapsed={isCollapsed}
        activeHref={activeView?.href ?? null}
      />

      <SidebarCollection
        label="Groups"
        entries={lists}
        isCollapsed={isCollapsed}
        activeHref={activeGroup ? groupHref(activeGroup.entity, activeGroup.id) : null}
        createLabel="New group"
        onCreate={() => setCreatingGroup(true)}
        emptyAction={
          listsQuery.isSuccess ? (
            <button
              type="button"
              onClick={() => setCreatingGroup(true)}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] py-1 text-left text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Plus className="size-3.5 flex-none" aria-hidden="true" />
              New group
            </button>
          ) : undefined
        }
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
