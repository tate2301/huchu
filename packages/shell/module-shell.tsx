"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { PageActions } from "@corelithzw/ui/layout/page-actions";
import { NavRail, NavRailGroup, NavRailItem } from "@corelithzw/ui/components/nav-rail";
import { filterHrefItemsByEnabledFeatures } from "@corelithzw/platform/gating/nav-filter";
import { navigationSectionsForRole } from "./navigation";
import {
  getWorkspaceModulePresentation,
  type WorkspaceModuleId,
} from "@corelithzw/platform/workspace-products";
import type { LucideIcon } from "@corelithzw/ui/lib/icons";

/**
 * A category rail plus a tab strip, filtered by what the tenant has bought.
 *
 * This was `HrShell`, hard-coded to one module. People and Payroll are two
 * modules with the same chrome, and the alternative was 137 duplicated lines that
 * would drift — the tab filtering here is subtle enough to be worth having in one
 * place: a tab is visible only if the *nav section* for the caller's role still
 * contains its href after feature filtering, so a screen cannot appear in the rail
 * that the route guard would then refuse.
 */

type ShellCategory<C extends string> = {
  id: C;
  label: string;
  icon: LucideIcon;
  order: number;
};

type ShellTab<T extends string, C extends string> = {
  id: T;
  label: string;
  href: string;
  icon: LucideIcon;
  categoryId: C;
};

type ModuleShellProps<T extends string, C extends string> = {
  moduleId: WorkspaceModuleId;
  /** The registered navigation section this module's tabs come from. */
  navSectionId: string;
  categories: ShellCategory<C>[];
  tabs: ShellTab<T, C>[];
  activeTab: T;
  /** Screen-reader label for the rail, e.g. "People". */
  railLabel: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  /** One line under the title, in the page band. Hidden below `md`. */
  description?: string;
};

export function ModuleShell<T extends string, C extends string>({
  moduleId,
  navSectionId,
  categories,
  tabs,
  activeTab,
  railLabel,
  actions,
  children,
  title,
  description,
}: ModuleShellProps<T, C>) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const enabledFeatures = useMemo(
    () =>
      (session?.user as { enabledFeatures?: string[] } | undefined)
        ?.enabledFeatures,
    [session],
  );
  const workspaceProfile = (
    session?.user as { workspaceProfile?: string } | undefined
  )?.workspaceProfile;

  const modulePresentation = useMemo(
    () =>
      getWorkspaceModulePresentation({
        moduleId,
        enabledFeatures,
        workspaceProfile,
      }),
    [moduleId, enabledFeatures, workspaceProfile],
  );

  const visibleTabs = useMemo(() => {
    const section = navigationSectionsForRole(role).find(
      (candidate) => candidate.id === navSectionId,
    );
    const visibleHrefs = new Set(
      filterHrefItemsByEnabledFeatures(section?.items ?? [], enabledFeatures).map(
        (item) => item.href,
      ),
    );
    return tabs.filter((tab) => visibleHrefs.has(tab.href));
  }, [enabledFeatures, navSectionId, role, tabs]);

  // No `activeCategoryId`: the rail shows every category at once, so there is
  // no "which category am I in" to resolve — `activeTab` alone marks the
  // current item.
  const visibleCategories = useMemo(
    () =>
      categories
        .filter((category) =>
          visibleTabs.some((tab) => tab.categoryId === category.id),
        )
        .sort((a, b) => a.order - b.order),
    [categories, visibleTabs],
  );

  /** Every category that has a visible tab, each carrying its own tabs. */
  const railGroups = useMemo(
    () =>
      visibleCategories
        .map((category) => ({
          category,
          tabs: visibleTabs.filter((tab) => tab.categoryId === category.id),
        }))
        .filter((group) => group.tabs.length > 0),
    [visibleCategories, visibleTabs],
  );

  return (
    // No `container mx-auto`. Tailwind's `container` caps at 1536 and centres
    // the remainder, so on a 1920 screen this module gave up ~120px on each
    // side of a surface that is mostly tables — and the rail made the loss
    // read as a river between the sidebar and the content. Full width; the
    // gutter is the only inset.
    <div className="w-full space-y-4">
      {actions ? <PageActions>{actions}</PageActions> : null}

      {/*
        The page band — the same one accounting uses, for the same reasons. The
        DS `PageHeader` set the title as a large H1 that duplicated the app bar
        directly above it and then scrolled away; this keeps the page's name and
        lede in view while the content moves under them.
      */}
      <div className="band-shell sticky top-0 z-30 flex min-h-[var(--page-band-h)] items-center gap-2.5 border-b border-[var(--border)] bg-[var(--canvas)]">
        <h1 className="text-base font-bold leading-tight tracking-[-0.012em] text-[var(--text-strong)]">
          {title ?? modulePresentation.title}
        </h1>
        {description ? (
          <span className="hidden min-w-0 truncate border-l border-[var(--border)] pl-2.5 text-sm text-[var(--text-subtle)] md:inline">
            {description}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 pt-4 lg:flex-row lg:gap-6">
        {/*
          One rail, grouped by category — no tab strip beneath it. Those were
          two levels of navigation for one decision: you picked a category in
          the rail, then picked again in a strip below it, and between them they
          cost a rail's width and a whole horizontal band before any data. Every
          destination in the module is now visible at once.
        */}
        <NavRail
          label={`${railLabel} navigation`}
          orientation="responsive"
          className="lg:sticky lg:top-[calc(var(--page-band-h)+1rem)] lg:w-[var(--rail-w)] lg:shrink-0 lg:self-start"
        >
          {railGroups.map(({ category, tabs }) => (
            <NavRailGroup key={category.id} label={category.label}>
              {tabs.map((tab) => (
                <NavRailItem
                  key={tab.id}
                  to={tab.href}
                  active={activeTab === tab.id}
                  icon={<tab.icon className="size-4" aria-hidden="true" />}
                >
                  {tab.label}
                </NavRailItem>
              ))}
            </NavRailGroup>
          ))}
        </NavRail>

        <div className="band-stack-content min-w-0 flex-1 space-y-5 pb-8">
          {children}
        </div>
      </div>
    </div>
  );
}
