"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import {
  AlertCircle,
  Camera,
  Dashboard,
  FileCheck,
  Shield,
  History,
  Server,
  Video,
  type LucideIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { getWorkspaceModulePresentation } from "@/lib/workspace-products";

export type CCTVTab =
  | "overview"
  | "live"
  | "cameras"
  | "nvrs"
  | "events"
  | "playback"
  | "access-logs";

type CCTVTabItem = {
  id: CCTVTab;
  label: string;
  href: string;
  icon: LucideIcon;
};

const cctvTabs: CCTVTabItem[] = [
  { id: "overview", label: "Overview", href: "/cctv/overview", icon: Dashboard },
  { id: "live", label: "Live Monitor", href: "/cctv/live", icon: Video },
  { id: "cameras", label: "Cameras", href: "/cctv/cameras", icon: Camera },
  { id: "nvrs", label: "NVRs", href: "/cctv/nvrs", icon: Server },
  { id: "events", label: "Events", href: "/cctv/events", icon: AlertCircle },
  { id: "playback", label: "Playback", href: "/cctv/playback", icon: History },
  { id: "access-logs", label: "Access Logs", href: "/cctv/access-logs", icon: FileCheck },
];

type CCTVShellProps = {
  activeTab: CCTVTab;
  actions?: ReactNode;
  children: ReactNode;
  title?: string;
  description?: string;
};

export function CCTVShell({
  activeTab,
  actions,
  children,
  title,
  description,
}: CCTVShellProps) {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
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
    <div className="w-full space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading
        title={title ?? modulePresentation.title}
        description={description ?? modulePresentation.description}
        className="mb-4"
      />

      <nav
        aria-label="CCTV navigation"
        className="overflow-hidden rounded-[18px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] shadow-[var(--surface-frame-shadow)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--edge-subtle)] px-5 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-[linear-gradient(135deg,rgba(13,65,70,0.95),rgba(7,33,41,0.98))] text-white shadow-[var(--surface-frame-shadow)]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Security Operations
              </p>
              <p className="text-sm font-medium text-foreground">
                Cameras, events, audit trails, and public relay monitoring
              </p>
            </div>
          </div>
          <p className="hidden text-xs text-muted-foreground lg:block">
            Choose a workspace area below to monitor streams, investigate incidents, or maintain devices.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 px-3 py-3 sm:px-4">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "border-[rgba(16,88,84,0.4)] bg-[rgba(16,88,84,0.12)] text-[rgb(16,88,84)] shadow-[var(--surface-frame-shadow)]"
                    : "border-transparent bg-transparent text-muted-foreground hover:border-[var(--edge-subtle)] hover:bg-[var(--surface-subtle)] hover:text-foreground",
                )}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {children}
    </div>
  );
}
