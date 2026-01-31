"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { cn } from "@/lib/utils";
import { Fuel, Home, Minus, Package, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StoresTab = "dashboard" | "inventory" | "fuel" | "issue" | "receive";

type StoresTabItem = {
  id: StoresTab;
  label: string;
  href: string;
  icon: LucideIcon;
};

const storesTabs: StoresTabItem[] = [
  { id: "dashboard", label: "Overview", href: "/stores/dashboard", icon: Home },
  { id: "inventory", label: "Stock on Hand", href: "/stores/inventory", icon: Package },
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
  const siteId = searchParams.get("siteId");

  const buildHref = (href: string) => {
    if (!siteId) return href;
    const params = new URLSearchParams();
    params.set("siteId", siteId);
    return `${href}?${params.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} description={description} />

      <nav
        aria-label="Stores navigation"
        className="flex w-full flex-wrap justify-start gap-2 border-b bg-transparent p-0"
      >
        {storesTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={buildHref(tab.href)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-semibold transition-colors border-b border-transparent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
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
