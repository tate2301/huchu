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
 * The module's tabs, named as the sidebar names them.
 *
 * They used to take their words from the module's presentation copy, which
 * still says "Stock on Hand" and "Fuel Ledger" — so the sidebar said "On hand"
 * and the tab under the bar said "Stock on Hand" for the same page. The labels
 * here are the sidebar's, and a page's title is its tab's label.
 */
const storesTabs: StoresTabItem[] = [
  { id: "dashboard", label: "Overview", href: "/stores/dashboard", icon: Home },
  { id: "inventory", label: "On hand", href: "/stores/inventory", icon: Package },
  { id: "locations", label: "Locations", href: "/stores/locations", icon: MapPin },
  { id: "movements", label: "Movements", href: "/stores/movements", icon: History },
  { id: "catalogue", label: "Catalogue", href: "/stores/catalogue", icon: TableRows },
  { id: "price-lists", label: "Price lists", href: "/stores/price-lists", icon: Scale },
  { id: "fuel", label: "Fuel log", href: "/stores/fuel", icon: Fuel },
];

/**
 * The views whose subject is stock moving — where "Receive stock" and "Issue
 * stock" are the page's verbs. On hand and Locations carry their own create
 * verb instead ("New stock item", "New location"), and the catalogue and price
 * lists are about selling, not moving.
 */
const MOVEMENT_VIEWS: ReadonlySet<StoresTab> = new Set(["dashboard", "movements", "fuel"]);

type StoresShellProps = {
  activeTab: StoresTab;
  /**
   * The page registers its own title and verb with the app bar — a
   * `RecordListShell` does — so the shell only draws the tabs.
   */
  barFromPage?: boolean;
  children: React.ReactNode;
};

export function StoresShell({ activeTab, barFromPage = false, children }: StoresShellProps) {
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

  const movesStock = MOVEMENT_VIEWS.has(activeTab);

  // Not memoised: the compiler infers a different dependency set than any
  // hand-written one here, and a fresh element per render costs nothing —
  // `PageChrome` only re-renders the bar, not the page. Left undefined where
  // the page has no movement verbs, which is how `PageChrome` is told to claim
  // only the title, so a panel inside can register the bar's action itself.
  const barActions = movesStock ? (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => setMovement("RECEIPT")}
      >
        <ArrowDownward className="h-4 w-4" />
        Receive stock
      </Button>
      <Button size="sm" className="gap-1.5" onClick={() => setMovement("ISSUE")}>
        <ArrowUpward className="h-4 w-4" />
        Issue stock
      </Button>
    </>
  ) : undefined;

  const activeLabel = storesTabs.find((tab) => tab.id === activeTab)!.label;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {barFromPage ? null : <PageChrome title={activeLabel}>{barActions}</PageChrome>}

      <SectionTabs label="Stock navigation">
        {visibleTabs.map((tab) => (
          <SectionTab
            key={tab.id}
            to={buildHref(tab.href)}
            active={activeTab === tab.id}
            icon={<tab.icon aria-hidden="true" />}
          >
            {tab.label}
          </SectionTab>
        ))}
      </SectionTabs>

      {children}

      {movesStock ? (
        <StockMovementDialog
          // Kept mounted with a null kind rather than unmounted, so the closing
          // animation has something to animate.
          kind={movement ?? "ISSUE"}
          open={movement !== null}
          onOpenChange={(next) => {
            if (!next) setMovement(null);
          }}
        />
      ) : null}
    </div>
  );
}
