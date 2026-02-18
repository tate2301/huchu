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
  History,
  Server,
  Video,
  type LucideIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";

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
  title = "CCTV Surveillance",
  description = "Monitor cameras, review security events, and control live streams across sites.",
}: CCTVShellProps) {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const visibleTabs = useMemo(
    () => filterHrefItemsByEnabledFeatures(cctvTabs, enabledFeatures),
    [enabledFeatures],
  );

  return (
    <div className="w-full space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading
        title={title}
        description={description}
        className="mb-4 [&_h1]:text-[1.375rem] [&_h1]:leading-8"
      />

      <nav
        aria-label="CCTV navigation"
        className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0 pb-1 shadow-[inset_0_-1px_0_0_var(--edge-neutral-rest)]"
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="ml-2">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
