"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import {
  Camera,
  FileCheck,
  History,
  Server,
  Video,
  type LucideIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { getWorkspaceModulePresentation } from "@/lib/workspace-products";

export type CCTVTab =
  | "live"
  | "nvrs"
  | "playback"
  | "access-logs";

type CCTVTabItem = {
  id: CCTVTab;
  label: string;
  href: string;
  icon: LucideIcon;
};

const cctvTabs: CCTVTabItem[] = [
  { id: "live", label: "Live Monitor", href: "/cctv/live", icon: Video },
  { id: "nvrs", label: "NVRs", href: "/cctv/nvrs", icon: Server },
  { id: "playback", label: "Playback", href: "/cctv/playback", icon: History },
  {
    id: "access-logs",
    label: "Access Logs",
    href: "/cctv/access-logs",
    icon: FileCheck,
  },
];

type CCTVShellProps = {
  activeTab: CCTVTab;
  navActions?: ReactNode;
  children: ReactNode;
};

export function CCTVShell({
  activeTab,
  navActions,
  children,
}: CCTVShellProps) {
  const { data: session } = useSession();
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
        moduleId: "cctv",
        enabledFeatures,
        workspaceProfile,
      }),
    [enabledFeatures, workspaceProfile],
  );
  const visibleTabs = useMemo(
    () => filterHrefItemsByEnabledFeatures(cctvTabs, enabledFeatures),
    [enabledFeatures],
  );

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 border-b border-[var(--edge-subtle)] px-4 py-3">
        <Camera />
        <h1 className="font-semibold text-xl">{modulePresentation.title}</h1>
      </div>
      <nav
        aria-label="CCTV navigation"
        className="border-b border-[var(--edge-subtle)]"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 px-2">
          <div className="flex flex-wrap gap-1">
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center justify-center gap-2 border-b-0 px-3 py-2 text-sm font-medium transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isActive
                      ? "border-primary border-b-2  text-primary"
                      : "border-transparent bg-transparent text-muted-foreground hover:bg-[var(--surface-subtle)] hover:text-foreground",
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
          {navActions ? (
            <div className="flex flex-wrap items-center gap-2 py-1">
              {navActions}
            </div>
          ) : null}
        </div>
      </nav>

      {children}
    </div>
  );
}
