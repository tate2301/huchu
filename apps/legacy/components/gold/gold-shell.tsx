"use client";

import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { type GoldTab, GOLD_TABS } from "@/lib/gold/tab-config";
import { filterGoldTabsByFeatures } from "@/lib/gold/visibility";
import { getWorkspaceModulePresentation } from "@/lib/workspace-products";

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

      <SectionTabs label="Gold navigation">
        {visibleTabs.map((tab) => (
          <SectionTab
            key={tab.id}
            to={tab.href}
            active={tab.id === activeTab}
            icon={<tab.icon aria-hidden="true" />}
          >
            {modulePresentation.tabLabels?.[tab.id] ?? tab.label}
          </SectionTab>
        ))}
      </SectionTabs>

      <div className="space-y-6">{children}</div>
    </div>
  );
}
