"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeading } from "@/components/layout/page-heading";
import {
  getAreaLabel,
  getVisibleManagementAreaNavItems,
  getVisibleManagementModuleItems,
  isActiveHref,
  isPathMatchingPrefix,
  type ManagementArea,
} from "@/lib/settings/management-nav";
import { cn } from "@/lib/utils";
import { getWorkspaceModulePresentation } from "@/lib/workspace-products";

type ManagementShellProps = {
  area: ManagementArea;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function ManagementShell({
  area,
  title,
  description,
  actions,
  children,
}: ManagementShellProps) {
  void description;
  const pathname = usePathname();
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
  const modulePresentation = useMemo(
    () =>
      getWorkspaceModulePresentation({
        moduleId: "management",
        enabledFeatures,
        workspaceProfile,
      }),
    [enabledFeatures, workspaceProfile],
  );

  const visibleModules = useMemo(
    () => getVisibleManagementModuleItems(enabledFeatures),
    [enabledFeatures],
  );
  const visibleAreaTabs = useMemo(
    () => getVisibleManagementAreaNavItems(area, enabledFeatures),
    [area, enabledFeatures],
  );
  const areaLabel = getAreaLabel(area);

  return (
    <div className="w-full min-h-[calc(100vh-var(--app-header-height,3.5rem)-3.25rem)]">
      <div className="grid w-full gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="space-y-5 lg:sticky lg:top-[calc(var(--app-header-height,3.5rem)+0.75rem)] lg:h-[calc(100vh-var(--app-header-height,3.5rem)-1.5rem)] lg:overflow-y-auto">
          <div className="space-y-2">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
              Settings
            </p>
            <nav
              aria-label="Settings areas"
              className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0"
            >
                {visibleModules.map((module) => {
                  const moduleActive = isPathMatchingPrefix(pathname, module.matchPrefixes);
                  const ModuleIcon = module.icon;
                  return (
                    <Link
                      key={module.id}
                      href={module.href}
                      data-active={moduleActive}
                      className={cn(
                        "inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-transparent bg-transparent px-2.5 text-[14px] font-medium text-[var(--sidebar-item-fg-muted)] lg:w-full",
                        "transition-[background-color,color,transform,box-shadow,border-color] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
                        "hover:translate-x-[1px] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-item-hover-fg)]",
                        "data-[active=true]:border-[var(--sidebar-item-active-border)] data-[active=true]:bg-[var(--sidebar-item-active-bg)] data-[active=true]:text-[var(--sidebar-item-active-fg)] data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-item-active-border)]",
                      )}
                    >
                      {ModuleIcon ? (
                        <ModuleIcon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            moduleActive ? "text-[var(--sidebar-item-active-fg)]" : "text-[var(--sidebar-item-icon)]",
                          )}
                        />
                      ) : null}
                      <span className="truncate">{module.label}</span>
                    </Link>
                  );
                })}
            </nav>
          </div>

          <div className="space-y-2">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
              {areaLabel}
            </p>
            <nav
              aria-label={`${areaLabel} sections`}
              className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0"
            >
                {visibleAreaTabs.map((tab) => {
                  const active = isActiveHref(pathname, tab.href);
                  const TabIcon = tab.icon;
                  return (
                    <Link
                      key={tab.id}
                      href={tab.href}
                      data-active={active}
                      className={cn(
                        "inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-transparent bg-transparent px-2.5 text-[14px] font-medium text-[var(--sidebar-item-fg-muted)] lg:w-full",
                        "transition-[background-color,color,transform,box-shadow,border-color] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
                        "hover:translate-x-[1px] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-item-hover-fg)]",
                        "data-[active=true]:border-[var(--sidebar-item-active-border)] data-[active=true]:bg-[var(--sidebar-item-active-bg)] data-[active=true]:text-[var(--sidebar-item-active-fg)] data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-item-active-border)]",
                      )}
                    >
                      {TabIcon ? (
                        <TabIcon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-[var(--sidebar-item-active-fg)]" : "text-[var(--sidebar-item-icon)]",
                          )}
                        />
                      ) : null}
                      <span className="truncate">{tab.label}</span>
                    </Link>
                  );
                })}
            </nav>
          </div>
        </aside>

        <section className="min-w-0 space-y-6 xl:pr-10">
          <div className="flex flex-col gap-4 border-b border-[var(--edge-subtle)] pb-4 sm:flex-row sm:items-start sm:justify-between">
            <PageHeading
              title={title || modulePresentation.title}
              className="mb-0"
            />
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
          <div className="w-full max-w-[96rem] space-y-6">{children}</div>
        </section>
      </div>
    </div>
  );
}
