"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { NavRail, NavRailItem } from "@/components/ui/nav-rail";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { getNavSectionsForRole } from "@/lib/navigation";
import {
  getWorkspaceModulePresentation,
  type WorkspaceModuleId,
} from "@/lib/workspace-products";
import type { LucideIcon } from "@/lib/icons";

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
  /** The `lib/navigation.ts` section this module's tabs come from. */
  navSectionId: string;
  categories: ShellCategory<C>[];
  tabs: ShellTab<T, C>[];
  activeTab: T;
  /** Screen-reader label for the rail, e.g. "People". */
  railLabel: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
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
    const section = getNavSectionsForRole(role).find(
      (candidate) => candidate.id === navSectionId,
    );
    const visibleHrefs = new Set(
      filterHrefItemsByEnabledFeatures(section?.items ?? [], enabledFeatures).map(
        (item) => item.href,
      ),
    );
    return tabs.filter((tab) => visibleHrefs.has(tab.href));
  }, [enabledFeatures, navSectionId, role, tabs]);

  const activeCategoryId = useMemo(() => {
    const active = visibleTabs.find((tab) => tab.id === activeTab);
    return active?.categoryId ?? visibleTabs[0]?.categoryId ?? categories[0]?.id;
  }, [activeTab, categories, visibleTabs]);

  const visibleCategories = useMemo(
    () =>
      categories
        .filter((category) =>
          visibleTabs.some((tab) => tab.categoryId === category.id),
        )
        .sort((a, b) => a.order - b.order),
    [categories, visibleTabs],
  );

  const tabsForActiveCategory = useMemo(
    () => visibleTabs.filter((tab) => tab.categoryId === activeCategoryId),
    [activeCategoryId, visibleTabs],
  );

  return (
    <div className="container mx-auto w-full space-y-4">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title ?? modulePresentation.title} className="mb-2" />

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
        <NavRail
          label={`${railLabel} category navigation`}
          orientation="responsive"
          className="lg:w-[var(--rail-w)] lg:shrink-0"
        >
          {visibleCategories.map((category) => {
            const categoryTab = visibleTabs.find(
              (tab) => tab.categoryId === category.id,
            );
            if (!categoryTab) return null;
            return (
              <NavRailItem
                key={category.id}
                to={categoryTab.href}
                active={activeCategoryId === category.id}
                icon={<category.icon className="size-4" aria-hidden="true" />}
              >
                {category.label}
              </NavRailItem>
            );
          })}
        </NavRail>

        <div className="min-w-0 flex-1 space-y-5">
          {tabsForActiveCategory.length > 1 && (
            <SectionTabs label={`${railLabel} section navigation`}>
              {tabsForActiveCategory.map((tab) => (
                <SectionTab
                  key={tab.id}
                  to={tab.href}
                  active={activeTab === tab.id}
                  icon={<tab.icon aria-hidden="true" />}
                >
                  {tab.label}
                </SectionTab>
              ))}
            </SectionTabs>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
