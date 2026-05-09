"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { cn } from "@/lib/utils";
import { type GoldTab, GOLD_TABS } from "@/lib/gold/tab-config";
import { filterGoldTabsByFeatures } from "@/lib/gold/visibility";
import { getWorkspaceModulePresentation } from "@/lib/workspace-products";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

type GoldShellProps = {
  activeTab: GoldTab;
  actions?: ReactNode;
  children: ReactNode;
  title?: string;
  description?: string;
};

// Hydration gate: returns false during SSR and on the first client paint
// (matching SSR), then true after hydration. useSyncExternalStore is the
// React-19-idiomatic way to express this without the setState-in-effect
// pattern that the new react-hooks rule rejects.
const subscribeNoop = () => () => {};
const getHydrated = () => true;
const getServerHydrated = () => false;

export function GoldShell({
  activeTab,
  actions,
  children,
  title,
  description,
}: GoldShellProps) {
  // useSession() returns different values on the server (no session
  // context → null) vs. the first client render (session resolved by
  // SessionProvider). Anything derived from session that affects
  // rendered HTML — tab labels, visible tab set — diverges between SSR
  // and CSR and trips React #418. Gate session reads behind a hydration
  // flag so SSR and the first client paint emit identical HTML;
  // session-aware rendering takes over after hydration completes.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    getHydrated,
    getServerHydrated,
  );
  const { data: rawSession } = useSession();
  const session = hydrated ? rawSession : null;
  const enabledFeatures = useMemo(
    () =>
      (session?.user as { enabledFeatures?: string[] } | undefined)
        ?.enabledFeatures,
    [session],
  );
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
  const modulePresentation = useMemo(
    () =>
      getWorkspaceModulePresentation({
        moduleId: "gold",
        enabledFeatures,
        workspaceProfile,
      }),
    [enabledFeatures, workspaceProfile],
  );
  const visibleTabs = useMemo(
    () => filterGoldTabsByFeatures(GOLD_TABS, enabledFeatures),
    [enabledFeatures],
  );

  return (
    <div className="w-full space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}

      <PageHeading
        title={title ?? modulePresentation.title}
        className="mb-4"
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
                    <span className="ml-2">{modulePresentation.tabLabels?.[tab.id] ?? tab.label}</span>
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
