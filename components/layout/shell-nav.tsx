"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { getActiveNavHref } from "@/lib/nav-match";
import type { NavItem } from "@/lib/navigation";
import type { RailArea } from "@/lib/rail/areas";
import { logoInitials } from "@/lib/rail/initials";
import { areaForHref, getRailModel, type RailModel } from "@/lib/rail/model";
import { canRoleOpenRetailPath, RETAIL_NAV_ITEMS, retailNavItemForPath } from "@/lib/retail/nav";
import {
  getWorkspaceSidebarModel,
  type WorkspaceOption,
  type WorkspaceSidebarModel,
} from "@/lib/workspaces";
import { useActiveWorkspace } from "@/components/layout/workspace-rail/use-active-workspace";

/** The workspace's name and branding, resolved on the server by the root layout. */
export type WorkspaceBrand = {
  name: string;
  logoUrl: string | null;
  /** `CompanyBranding.legalName`, which the logo tile's initials are read from. */
  legalName: string | null;
};

export const NAV_BADGES_KEY = ["nav-badges"] as const;

const NO_BADGES: Record<string, string> = {};
const noopSubscribe = () => () => {};

type ShellNav = {
  model: WorkspaceSidebarModel;
  rail: RailModel;
  currentArea: RailArea | null;
  activeHref: string | null;
  activeItem: NavItem | null;
  /**
   * The header's title when the page sets none (00-foundations 5.3.5): the
   * current item's label, or the label of the retail page's item when this
   * person cannot see it (a refused page is still named for what it is).
   */
  pageLabel: string | null;
  /** The page is "not found": it names itself, and no nav item is current. */
  setNotFound: (notFound: boolean) => void;
  /** The session is still loading on a retail page: nothing is drawn yet. */
  pending: boolean;
  /**
   * The signed-in role may not open this retail page: its nav item's
   * `requires` (00-foundations 5.3.4) refuse them. The page is not drawn.
   */
  refused: boolean;
  /** Where this person's workspace starts, for the refusal's way out. */
  homeHref: string;
  badges: Record<string, string>;
  companyName: string;
  initials: string;
  logoUrl: string | null;
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string;
  selectWorkspace: (id: string) => void;
};

const ShellNavContext = React.createContext<ShellNav | null>(null);

/**
 * The navigation every part of the shell reads: the rail, the page header's
 * title fallback and the phone drawer. Worked out once per render of the shell.
 */
export function ShellNavProvider({
  brand,
  children,
}: {
  brand?: WorkspaceBrand | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();
  const user = session?.user as
    | { role?: string; enabledFeatures?: string[]; workspaceProfile?: string; companySlug?: string }
    | undefined;
  const role = user?.role;
  const enabledFeatures = React.useMemo(() => user?.enabledFeatures, [user?.enabledFeatures]);
  const workspaceProfile = user?.workspaceProfile;

  // A company that runs two businesses has two rails, and which one you left
  // off in is yours rather than the tenant's.
  const { activeWorkspaceId, select } = useActiveWorkspace(user?.companySlug ?? "default");

  const modelArgs = React.useMemo(
    () => ({ role, enabledFeatures, workspaceProfile }),
    [enabledFeatures, role, workspaceProfile],
  );

  // The rail follows the page: when the chosen workspace has no item for this
  // page, the one that does is drawn instead. The choice itself is left alone.
  const model = React.useMemo(() => {
    const chosen = getWorkspaceSidebarModel({ ...modelArgs, activeWorkspaceId });
    if (getActiveNavHref(chosen.sections, pathname, searchParams, RETAIL_NAV_ITEMS)) return chosen;
    for (const workspace of chosen.workspaces) {
      if (workspace.id === chosen.activeWorkspaceId) continue;
      const owner = getWorkspaceSidebarModel({ ...modelArgs, activeWorkspaceId: workspace.id });
      if (getActiveNavHref(owner.sections, pathname, searchParams, RETAIL_NAV_ITEMS)) return owner;
    }
    return chosen;
  }, [activeWorkspaceId, modelArgs, pathname, searchParams]);

  const selectWorkspace = React.useCallback(
    (id: string) => {
      select(id);
      const target = getWorkspaceSidebarModel({ ...modelArgs, activeWorkspaceId: id });
      if (target.homeHref && target.homeHref !== pathname) router.push(target.homeHref);
    },
    [modelArgs, pathname, router, select],
  );

  const rail = React.useMemo(() => getRailModel(model.sections), [model.sections]);
  // Every retail page is known, visible or not, so a page whose item this
  // role cannot see lights nothing rather than its nearest visible ancestor.
  // A path that does not exist names no nav item, even when an item's href is
  // a prefix of it (`/retail/stock/count` is not On hand).
  const [notFound, setNotFound] = React.useState(false);
  const activeHref = React.useMemo(
    () => (notFound ? null : getActiveNavHref(model.sections, pathname, searchParams, RETAIL_NAV_ITEMS)),
    [model.sections, notFound, pathname, searchParams],
  );
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
  const currentArea = React.useMemo(() => areaForHref(rail, activeHref), [activeHref, rail]);
  const activeItem = React.useMemo(
    () => currentArea?.items.find((item) => item.href === activeHref) ?? null,
    [activeHref, currentArea],
  );

  // The figures beside panel items (00-foundations 4.3). Cached for a minute,
  // refetched on focus, and refreshed after any change the person makes.
  const hasRetail = model.sections.some((section) => section.id.startsWith("retail-"));
  const badgesQuery = useQuery({
    queryKey: NAV_BADGES_KEY,
    queryFn: () => fetchJson<{ badges: Record<string, string> }>("/api/v2/retail/nav/badges"),
    enabled: hasRetail,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  React.useEffect(() => {
    if (!hasRetail) return;
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") {
        void queryClient.invalidateQueries({ queryKey: NAV_BADGES_KEY });
      }
    });
  }, [hasRetail, queryClient]);

  // The query cache outlives the page (it is persisted for offline use), so
  // the figures are drawn after hydration rather than diverging from the
  // server's HTML.
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);

  const companyName = brand?.name ?? model.workspaceLabel;
  const value = React.useMemo<ShellNav>(
    () => ({
      model,
      rail,
      currentArea,
      activeHref,
      activeItem,
      pageLabel: activeItem?.label ?? pageItem?.label ?? null,
      setNotFound,
      pending,
      refused,
      homeHref: model.homeHref,
      badges: (mounted && badgesQuery.data?.badges) || NO_BADGES,
      companyName,
      initials: logoInitials(brand?.legalName, companyName),
      logoUrl: brand?.logoUrl ?? null,
      workspaces: model.workspaces,
      activeWorkspaceId: model.activeWorkspaceId,
      selectWorkspace,
    }),
    [
      activeHref,
      activeItem,
      badgesQuery.data,
      brand,
      companyName,
      currentArea,
      model,
      mounted,
      pageItem,
      pending,
      rail,
      refused,
      selectWorkspace,
    ],
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

export function useShellNav(): ShellNav {
  const context = React.useContext(ShellNavContext);
  if (!context) throw new Error("useShellNav must be used within ShellNavProvider");
  return context;
}
