"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { PageActions, PageChrome } from "@/components/layout/page-chrome";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { getWorkspaceModulePresentation } from "@/lib/workspace-products";
import {
  Calendar,
  ClipboardList,
  Home,
  Plus,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";

export type MaintenanceTab =
  | "dashboard"
  | "equipment"
  | "work-orders"
  | "breakdown"
  | "schedule";

type MaintenanceTabItem = {
  id: MaintenanceTab;
  label: string;
  href: string;
  icon: LucideIcon;
};

const maintenanceTabs: MaintenanceTabItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/maintenance", icon: Home },
  {
    id: "equipment",
    label: "Equipment Register",
    href: "/maintenance/equipment",
    icon: Wrench,
  },
  {
    id: "work-orders",
    label: "Work Orders",
    href: "/maintenance/work-orders",
    icon: ClipboardList,
  },
  {
    id: "breakdown",
    label: "Log Breakdown",
    href: "/maintenance/breakdown",
    icon: Plus,
  },
  {
    id: "schedule",
    label: "PM Schedule",
    href: "/maintenance/schedule",
    icon: Calendar,
  },
];

type MaintenanceShellProps = {
  activeTab: MaintenanceTab;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** The page's own name, for the app bar; left off, the route table names it. */
  title?: string;
};

export function MaintenanceShell({
  activeTab,
  actions,
  children,
  title,
}: MaintenanceShellProps) {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
  const modulePresentation = useMemo(
    () =>
      getWorkspaceModulePresentation({
        moduleId: "maintenance",
        enabledFeatures,
        workspaceProfile,
      }),
    [enabledFeatures, workspaceProfile],
  );
  const visibleTabs = useMemo(
    () => filterHrefItemsByEnabledFeatures(maintenanceTabs, enabledFeatures),
    [enabledFeatures],
  );

  return (
    <div className="w-full space-y-6">
      {/* The page names itself once, in the app bar — no heading block under
          it repeating the name. */}
      {title ? (
        <PageChrome title={title}>{actions}</PageChrome>
      ) : actions ? (
        <PageActions>{actions}</PageActions>
      ) : null}

      <SectionTabs label="Maintenance navigation">
        {visibleTabs.map((tab) => (
          <SectionTab
            key={tab.id}
            to={tab.href}
            active={activeTab === tab.id}
            icon={<tab.icon aria-hidden="true" />}
          >
            {modulePresentation.tabLabels?.[tab.id] ?? tab.label}
          </SectionTab>
        ))}
      </SectionTabs>

      {children}
    </div>
  );
}
