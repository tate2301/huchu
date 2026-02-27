"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { cn } from "@/lib/utils";
import { type GoldTab, GOLD_TABS } from "@/lib/gold/tab-config";
import { filterGoldTabsByFeatures } from "@/lib/gold/visibility";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

type GoldShellProps = {
  activeTab: GoldTab;
  actions?: ReactNode;
  children: ReactNode;
  title?: string;
  description?: string;
};

export function GoldShell({
  activeTab,
  actions,
  children,
  title = "Gold Chain",
  description = "Track gold from shift output to sale and payout.",
}: GoldShellProps) {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () =>
      (session?.user as { enabledFeatures?: string[] } | undefined)
        ?.enabledFeatures,
    [session],
  );
  const visibleTabs = useMemo(
    () => filterGoldTabsByFeatures(GOLD_TABS, enabledFeatures),
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

      <nav aria-label="Gold navigation">
        <Tabs value={activeTab}>
          <TabsList>
            {visibleTabs.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <TabsTrigger value={tab.id} key={tab.id} asChild>
                  <Link
                    href={tab.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center justify-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isActive
                        ? "border-[var(--action-primary-bg)] text-[var(--action-primary-bg)]"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <tab.icon className="size-5" />
                    <span className="ml-2">{tab.label}</span>
                  </Link>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </nav>

      <div className="space-y-6">{children}</div>
    </div>
  );
}
