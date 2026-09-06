"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { PageChrome } from "@/components/layout/page-chrome";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import {
  ArrowDownward,
  ArrowUpward,
  Fuel,
  History,
  Home,
  MapPin,
  Package,
  Scale,
  TableRows,
} from "@/lib/icons";
import type { LucideIcon } from "@/lib/icons";
import { getWorkspaceModulePresentation } from "@/lib/workspace-products";
import { resolveVerticalDefaults } from "@/lib/platform/vertical-defaults";

import {
  StockMovementDialog,
  type StockMovementKind,
} from "./stock-movement-dialog";

export type StoresTab =
  | "dashboard"
  | "inventory"
  | "locations"
  | "movements"
  | "catalogue"
  | "price-lists"
  | "fuel";

type StoresTabItem = {
  id: StoresTab;
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * The module's tabs.
 *
 * Issue and Receive used to sit here, which put two write actions in a row of
 * places to look. They are dialogs opened from the top bar now, so this row is
 * only ever "which view of the stock".
 *
 * "Stock on hand" and "Stores" were also one page doing two jobs: a list of
 * items summed across every store, and a list of stores. Splitting them is
 * what makes "how much of this do we have" and "what is in this store"
 * separately answerable.
 */
const storesTabs: StoresTabItem[] = [
  { id: "dashboard", label: "Overview", href: "/stores/dashboard", icon: Home },
  { id: "inventory", label: "Stock on hand", href: "/stores/inventory", icon: Package },
  { id: "locations", label: "Locations", href: "/stores/locations", icon: MapPin },
  { id: "movements", label: "Movements", href: "/stores/movements", icon: History },
  { id: "catalogue", label: "Catalogue", href: "/stores/catalogue", icon: TableRows },
  { id: "price-lists", label: "Price lists", href: "/stores/price-lists", icon: Scale },
  { id: "fuel", label: "Fuel ledger", href: "/stores/fuel", icon: Fuel },
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
  title,
}: StoresShellProps) {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const siteId = searchParams.get("siteId");
  // `?record=issue` opens the dialog straight away, which is what the old
  // /stores/issue and /stores/receive routes now redirect to.
  const requested = searchParams.get("record");
  const [movement, setMovement] = useState<StockMovementKind | null>(
    requested === "issue" ? "ISSUE" : requested === "receive" ? "RECEIPT" : null,
  );
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
  const verticalDefaults = useMemo(
    () =>
      resolveVerticalDefaults({
        workspaceProfile,
        enabledFeatures,
      }),
    [enabledFeatures, workspaceProfile],
  );
  const modulePresentation = useMemo(
    () =>
      getWorkspaceModulePresentation({
        moduleId: "stores",
        enabledFeatures,
        workspaceProfile,
      }),
    [enabledFeatures, workspaceProfile],
  );
  const visibleTabs = useMemo(
    () =>
      filterHrefItemsByEnabledFeatures(
        storesTabs.filter((tab) => tab.id !== "fuel" || verticalDefaults.stores.allowFuel),
        enabledFeatures,
      ),
    [enabledFeatures, verticalDefaults.stores.allowFuel],
  );

  const buildHref = (href: string) => {
    if (!siteId) return href;
    const params = new URLSearchParams();
    params.set("siteId", siteId);
    return `${href}?${params.toString()}`;
  };

  // Issuing and receiving move stock, so they belong on the views about stock
  // — which is the same split the sidebar already draws between "Stock" and
  // "What we sell". On the catalogue they were the wrong verbs in the loudest
  // place on the screen: at 390px the bar showed "Receive" and pushed "Issue"
  // into an overflow menu, while the page's actual primary action, "New item",
  // sat down in the body under a heading and a paragraph.
  const movesStock = activeTab !== "catalogue" && activeTab !== "price-lists";

  // Not memoised: the compiler infers a different dependency set than any
  // hand-written one here, and a fresh element per render costs nothing —
  // `PageChrome` only re-renders the bar, not the page.
  const barActions = movesStock ? (
      <>
        {actions}
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setMovement("RECEIPT")}
        >
          <ArrowDownward className="h-4 w-4" />
          Receive
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => setMovement("ISSUE")}>
          <ArrowUpward className="h-4 w-4" />
          Issue
        </Button>
      </>
  ) : (
    // Left undefined rather than empty when the page has nothing of its own:
    // that is how `PageChrome` is told to claim only the title, so the panel
    // inside can register the bar's action itself.
    actions
  );

  const activeLabel =
    visibleTabs.find((tab) => tab.id === activeTab)?.label ?? modulePresentation.title;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageChrome title={title ?? activeLabel}>{barActions}</PageChrome>

      <SectionTabs label="Stores navigation">
        {visibleTabs.map((tab) => (
          <SectionTab
            key={tab.id}
            to={buildHref(tab.href)}
            active={activeTab === tab.id}
            icon={<tab.icon aria-hidden="true" />}
          >
            {modulePresentation.tabLabels?.[tab.id] ?? tab.label}
          </SectionTab>
        ))}
      </SectionTabs>

      {children}

      <StockMovementDialog
        // Kept mounted with a null kind rather than unmounted, so the closing
        // animation has something to animate.
        kind={movement ?? "ISSUE"}
        open={movement !== null}
        onOpenChange={(next) => {
          if (!next) setMovement(null);
        }}
      />
    </div>
  );
}
