"use client";

import { useMemo, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import {
  Camera,
  FileCheck,
  Grid3x3,
  History,
  Server,
  Video,
  type LucideIcon,
} from "@/lib/icons";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";

// CCTV was dropped from the catalog by ST-1.1, so it no longer has a
// `WorkspaceModuleId` and cannot be looked up in the workspace module
// presentation registry. The heading falls back to the literal the registry
// used to return; the module itself is deleted by ST-2, not here.
const CCTV_MODULE_TITLE = "CCTV & Surveillance";

export type CCTVTab =
  | "overview"
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
  { id: "overview", label: "Overview", href: "/cctv/overview", icon: Grid3x3 },
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
  const visibleTabs = useMemo(
    () => filterHrefItemsByEnabledFeatures(cctvTabs, enabledFeatures),
    [enabledFeatures],
  );

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 border-b border-[var(--edge-subtle)] px-4 py-3">
        <Camera />
        <h1 className="font-semibold text-xl">{CCTV_MODULE_TITLE}</h1>
      </div>
      <SectionTabs
        label="CCTV navigation"
        className="flex-nowrap items-end justify-between gap-3 px-2"
      >
        <span className="flex flex-wrap items-end gap-0.5">
          {visibleTabs.map((tab) => (
            <SectionTab
              key={tab.id}
              to={tab.href}
              active={activeTab === tab.id}
              icon={<tab.icon aria-hidden="true" />}
            >
              {tab.label}
            </SectionTab>
          ))}
        </span>
        {navActions ? (
          <span className="flex flex-wrap items-center gap-2 py-1">
            {navActions}
          </span>
        ) : null}
      </SectionTabs>

      {children}
    </div>
  );
}
