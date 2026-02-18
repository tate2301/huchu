"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { cn } from "@/lib/utils";
import { Fuel, History, Home, Minus, Package, Plus } from "@/lib/icons";
import type { LucideIcon } from "@/lib/icons";

export type StoresTab =
  | "dashboard"
  | "inventory"
  | "movements"
  | "fuel"
  | "issue"
  | "receive";

type StoresTabItem = {
  id: StoresTab;
  label: string;
  href: string;
  icon: LucideIcon;
};

const storesTabs: StoresTabItem[] = [
  { id: "dashboard", label: "Overview", href: "/stores/dashboard", icon: Home },
  { id: "inventory", label: "Stock on Hand", href: "/stores/inventory", icon: Package },
  { id: "movements", label: "Movements", href: "/stores/movements", icon: History },
  { id: "fuel", label: "Fuel Ledger", href: "/stores/fuel", icon: Fuel },
  { id: "issue", label: "Issue Stock", href: "/stores/issue", icon: Minus },
  { id: "receive", label: "Receive Stock", href: "/stores/receive", icon: Plus },
];

type StoresShellProps = {
  activeTab: StoresTab;
  actions?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
};

export function StoresShell({
  activeTab,
  actions,
  children,
  title = "Stores & Fuel Management",
  description = "Inventory tracking and fuel ledger",
}: StoresShellProps) {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const siteId = searchParams.get("siteId");
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const visibleTabs = useMemo(
    () => filterHrefItemsByEnabledFeatures(storesTabs, enabledFeatures),
    [enabledFeatures],
  );

  const buildHref = (href: string) => {
    if (!siteId) return href;
    const params = new URLSearchParams();
    params.set("siteId", siteId);
    return `${href}?${params.toString()}`;
  };

  return (
    <div className="w-full space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading
        title={title}
        description={description}
        className="mb-4 [&_h1]:text-[1.375rem] [&_h1]:leading-8"
      />

      <nav
        aria-label="Stores navigation"
        className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0 pb-1 shadow-[inset_0_-1px_0_0_var(--edge-neutral-rest)]"
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={buildHref(tab.href)}
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
