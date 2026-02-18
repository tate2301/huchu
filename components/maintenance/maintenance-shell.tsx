"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { cn } from "@/lib/utils";
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
  title?: string;
  description?: string;
};

export function MaintenanceShell({
  activeTab,
  actions,
  children,
  title = "Maintenance Management",
  description = "Equipment tracking and work orders",
}: MaintenanceShellProps) {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const visibleTabs = useMemo(
    () => filterHrefItemsByEnabledFeatures(maintenanceTabs, enabledFeatures),
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
        aria-label="Maintenance navigation"
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
              <tab.icon className="size-5" />
              <span className="ml-2">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
