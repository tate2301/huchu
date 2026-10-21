"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import type { NavItem } from "@/lib/navigation";
import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";
import { GearSix } from "@/lib/icons";
import { logoInitials } from "@/lib/nav/initials";
import { canOpenFor, lockedAddresses, productGroupsFor, visibleAddresses } from "@/lib/nav/gate";
import { composeNav, type ComposedGroup } from "@/lib/nav/compose";
import { activeNav, type ActiveNav } from "@/lib/nav/match";
import {
  canRoleOpenRetailPath,
  hiddenRetailNavHrefs,
  retailNavItemForPath,
  type RetailNavCondition,
} from "@/lib/retail/nav";
import { RESOURCE_LABELS } from "@/lib/retail/permission-matrix";
import { getWorkspaceSidebarModel } from "@/lib/workspaces";
import { BUILD_HOME_KEY, fetchBuildHome } from "@/components/build/build-data";

/** The workspace's name and branding, resolved on the server by the root layout. */
export type WorkspaceBrand = {
  name: string;
  logoUrl: string | null;
  /** `CompanyBranding.legalName`, which the logo tile's initials are read from. */
  legalName: string | null;
};

/** The shop facts retail nav items wait on (`RetailNavItem.when`). */
export type ShopConditions = Partial<Record<RetailNavCondition, boolean>>;

export const NAV_BADGES_KEY = ["nav-badges"] as const;
/** Books' row figures (`GET /api/books/nav`), under the same key so a change refreshes both. */
const BOOKS_BADGES_KEY = [...NAV_BADGES_KEY, "books"] as const;

const NO_BADGES: Record<string, string> = {};

/**
 * The Management surface (`ManagementShell`, its own settings rail): the gear
 * at the foot of the rail and the shelf row above it, in every workspace.
 */
export const MANAGEMENT_NAV_ITEM: NavItem = {
  href: "/management/master-data",
  label: "Management",
  icon: GearSix,
};
const noopSubscribe = () => () => {};

export type ShellNav = {
  /** The address of the sidebar row this page is in, or null. */
  activeHref: string | null;
  /** Management, for every role allowed to open it. */
  management: NavItem | null;
  /** The sidebar for this person (`lib/nav`): what they may open, in groups. */
  groups: ComposedGroup[];
  /** The node, and child, this page is in `groups`. */
  active: ActiveNav | null;
  /**
   * The header's title when the page sets none (00-foundations 5.3.5): the
   * current row's label, or the label of the retail page's item when this
   * person cannot see it (a refused page is still named for what it is).
   */
  pageLabel: string | null;
  /** The name of the sidebar icon for this page (`NAV_ICONS`), or null. */
  pageIcon: string | null;
  /** The page is "not found": it names itself, and no nav item is current. */
  setNotFound: (notFound: boolean) => void;
  /** The session is still loading on a retail page: nothing is drawn yet. */
  pending: boolean;
  /**
   * The signed-in role may not open this retail page: its nav item's
   * `requires` (00-foundations 5.3.4) refuse them. The page is not drawn.
   */
  refused: boolean;
  /**
   * What the refusal names: the matrix's label for the page's first required
   * resource ("the fiscal device"), so the page says the sentence its API
   * refuses with (`retailPermissionDenial`), not the nav label.
   */
  refusalNoun: string;
  /** Where this person's workspace starts, for the refusal's way out. */
  homeHref: string;
  badges: Record<string, string>;
  companyName: string;
  initials: string;
  logoUrl: string | null;
};

const ShellNavContext = React.createContext<ShellNav | null>(null);

/**
 * The workspace's brand, for surfaces drawn outside the shell's navigation
 * (Management's full-page surface) that still name the workspace: "Back to
 * Floorcode". Provided by `AppShell` around every route.
 */
export const WorkspaceBrandContext = React.createContext<WorkspaceBrand | null>(null);

/** The workspace's name as the shell shows it, or null where it is not known. */
export function useWorkspaceName(): string | null {
  const nav = React.useContext(ShellNavContext);
  const brand = React.useContext(WorkspaceBrandContext);
  return nav?.companyName ?? brand?.name ?? null;
}

/**
 * The navigation every part of the shell reads: the sidebar, the page header's
 * title fallback and the phone bar. Worked out once per render of the shell.
 */
export function ShellNavProvider({
  brand,
  shopConditions = null,
  children,
}: {
  brand?: WorkspaceBrand | null;
  /** The shop facts as the server found them, so its HTML and the first client render agree. */
  shopConditions?: ShopConditions | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();
  const user = session?.user as
    | { role?: string; enabledFeatures?: string[]; workspaceProfile?: string; companySlug?: string }
    | undefined;
  const role = user?.role;
  const enabledFeatures = React.useMemo(() => user?.enabledFeatures, [user?.enabledFeatures]);
  const workspaceProfile = user?.workspaceProfile;

  const modelArgs = React.useMemo(
    () => ({ role, enabledFeatures, workspaceProfile }),
    [enabledFeatures, role, workspaceProfile],
  );

  // What this person may open, from the checks the platform already has
  // (`lib/nav/gate.ts`), and the tenant's own front door for the refusal's way out.
  const open = React.useMemo(() => visibleAddresses(modelArgs), [modelArgs]);
  const front = React.useMemo(() => getWorkspaceSidebarModel(modelArgs), [modelArgs]);

  // The figures beside panel items (00-foundations 4.3), and the shop facts
  // some items wait on. Cached for a minute, refetched on focus, and
  // refreshed after any change the person makes.
  const hasRetail = React.useMemo(() => [...open].some((href) => href.startsWith("/retail")), [open]);
  const badgesQuery = useQuery({
    queryKey: NAV_BADGES_KEY,
    queryFn: () =>
      fetchJson<{ badges: Record<string, string>; conditions?: ShopConditions }>("/api/v2/retail/nav/badges"),
    enabled: hasRetail,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const hasBooks = React.useMemo(() => [...open].some((href) => href.startsWith("/books")), [open]);
  const booksQuery = useQuery({
    queryKey: BOOKS_BADGES_KEY,
    queryFn: () => fetchJson<{ badges: Record<string, string> }>("/api/books/nav"),
    enabled: hasBooks,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // Build's rows count what each holds, while Build is the page's module.
  const onBuild = pathname === "/build" || pathname.startsWith("/build/");
  const buildQuery = useQuery({
    queryKey: BUILD_HOME_KEY,
    queryFn: fetchBuildHome,
    enabled: onBuild,
    staleTime: 60_000,
  });

  // The query cache outlives the page (it is persisted for offline use), so
  // what it holds is read after hydration rather than diverging from the
  // server's HTML: until then the panel draws the facts the server found.
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const conditions = (mounted ? badgesQuery.data?.conditions : undefined) ?? shopConditions;
  const retailBadges = mounted ? badgesQuery.data?.badges : undefined;
  const booksBadges = mounted ? booksQuery.data?.badges : undefined;
  const buildBadges = mounted && onBuild ? buildQuery.data?.badges : undefined;
  const badges = React.useMemo(
    () =>
      retailBadges || booksBadges || buildBadges ? { ...retailBadges, ...booksBadges, ...buildBadges } : NO_BADGES,
    [booksBadges, buildBadges, retailBadges],
  );

  // The sidebar: one tree for the whole platform, from what this person may
  // open. A retail page whose shop condition does not hold, or that waits on a
  // badge it has not got, is not offered, unless it is the page they are on.
  const [notFound, setNotFound] = React.useState(false);
  const { groups, active } = React.useMemo(() => {
    const allowed = canOpenFor(modelArgs);
    const locks = lockedAddresses(modelArgs);
    const lockOf = (href: string) => locks.get(href.split("?")[0] ?? href);
    const unmet = hiddenRetailNavHrefs(conditions, badges);
    const products = productGroupsFor(open, workspaceProfile);
    const here = activeNav(composeNav({ canOpen: allowed, products }), pathname, searchParams);
    const composed = composeNav({
      canOpen: (href) => allowed(href) && (!unmet.has(href) || href === here?.href),
      products,
      lockOf,
    });
    return { groups: composed, active: notFound ? null : activeNav(composed, pathname, searchParams) };
  }, [badges, conditions, modelArgs, notFound, open, pathname, searchParams, workspaceProfile]);
  const activeHref = active?.href ?? null;

  // Every retail page is known, visible or not, so a page whose item this
  // role cannot see lights nothing rather than its nearest visible ancestor.
  // A path that does not exist names no nav item, even when an item's href is
  // a prefix of it (`/retail/stock/count` is not On hand).
  const pageItem = React.useMemo(
    () => (notFound ? null : retailNavItemForPath(pathname, searchParams)),
    [notFound, pathname, searchParams],
  );
  // Until the session is known nobody can say whether the page is this
  // person's, so it is not drawn: its queries would fire and be refused.
  const isRetailPage = pathname === "/retail" || pathname.startsWith("/retail/");
  const pending = isRetailPage && sessionStatus === "loading";
  const refused =
    sessionStatus === "authenticated" && !canRoleOpenRetailPath(role, pathname, searchParams);
  const refusalNoun = pageItem ? RESOURCE_LABELS[pageItem.requires[0][0]] : "this page";
  React.useEffect(() => {
    if (!hasRetail && !hasBooks) return;
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") {
        void queryClient.invalidateQueries({ queryKey: NAV_BADGES_KEY });
      }
    });
  }, [hasBooks, hasRetail, queryClient]);

  const companyName = brand?.name ?? front.workspaceLabel;
  const value = React.useMemo<ShellNav>(
    () => ({
      activeHref,
      management: isRouteAllowedForRole(role, MANAGEMENT_NAV_ITEM.href) ? MANAGEMENT_NAV_ITEM : null,
      groups,
      active,
      pageLabel: active?.label ?? pageItem?.label ?? null,
      pageIcon: active?.icon ?? null,
      setNotFound,
      pending,
      refused,
      refusalNoun,
      homeHref: front.homeHref,
      badges,
      companyName,
      initials: logoInitials(brand?.legalName, companyName),
      logoUrl: brand?.logoUrl ?? null,
    }),
    [active, activeHref, badges, brand, companyName, front, groups, pageItem, pending, refused, refusalNoun, role],
  );

  return <ShellNavContext.Provider value={value}>{children}</ShellNavContext.Provider>;
}

/**
 * Marks the page as "not found" while it is mounted: the header reads its own
 * title and no nav item is current.
 */
export function useNotFoundPage() {
  const setNotFound = React.useContext(ShellNavContext)?.setNotFound;
  React.useEffect(() => {
    if (!setNotFound) return;
    setNotFound(true);
    return () => setNotFound(false);
  }, [setNotFound]);
}

/** The shell's navigation, or null outside the shell (sign-in, portals). */
export function useOptionalShellNav(): ShellNav | null {
  return React.useContext(ShellNavContext);
}

/** The shell's nav, or null outside the workspace shell (the admin portal). */
export function useShellNavIfAny(): ShellNav | null {
  return React.useContext(ShellNavContext);
}

export function useShellNav(): ShellNav {
  const context = React.useContext(ShellNavContext);
  if (!context) throw new Error("useShellNav must be used within ShellNavProvider");
  return context;
}
