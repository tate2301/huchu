"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { useGuidedMode } from "@/hooks/use-guided-mode";
import { fetchStockLocations } from "@/lib/api";
import { Circle, HelpCircle } from "@/lib/icons";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";
import { getWorkspaceSidebarModel } from "@/lib/workspaces";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getActiveNavHref } from "@/components/layout/app-sidebar/sidebar-helpers";
import { RailAvatar } from "@/components/layout/workspace-rail/rail-avatar";
import { useActiveWorkspace } from "@/components/layout/workspace-rail/use-active-workspace";
import { WorkspaceRail } from "@/components/layout/workspace-rail";

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const { data: session } = useSession();
  const user = session?.user as
    | {
        role?: string;
        enabledFeatures?: string[];
        workspaceProfile?: string;
        companySlug?: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
      }
    | undefined;
  const role = user?.role;
  const enabledFeatures = React.useMemo(
    () => user?.enabledFeatures,
    [user?.enabledFeatures],
  );
  const workspaceProfile = user?.workspaceProfile;
  const { state, setOpen } = useSidebar();
  const isCollapsed = state === "collapsed";
  const router = useRouter();

  // A company that runs two businesses has two rails, and which one you left
  // off in is yours rather than the tenant's. Keyed by company so the same
  // person signed into two of them keeps two answers.
  const { activeWorkspaceId, select } = useActiveWorkspace(
    user?.companySlug ?? "default",
  );

  // Which stock surfaces are worth offering depends on how the stock is laid
  // out, and that is a fact about the tenant rather than about its plan — a
  // transfer needs two active locations at one site before it has anywhere to
  // go. Only asked for where a stock surface could appear at all.
  const stockLocationsQuery = useQuery({
    queryKey: ["stock-locations", "active"],
    queryFn: () => fetchStockLocations({ active: true, limit: 200 }),
    enabled: hasTokenFeature(enabledFeatures, "stores.inventory"),
    staleTime: 5 * 60_000,
  });
  const activeStockLocationSiteIds = React.useMemo(
    () => stockLocationsQuery.data?.data.map((location) => location.siteId),
    [stockLocationsQuery.data],
  );

  const modelArgs = React.useMemo(
    () => ({ role, enabledFeatures, workspaceProfile, activeStockLocationSiteIds }),
    [activeStockLocationSiteIds, enabledFeatures, role, workspaceProfile],
  );

  const sidebarModel = React.useMemo(
    () => getWorkspaceSidebarModel({ ...modelArgs, activeWorkspaceId }),
    [activeWorkspaceId, modelArgs],
  );

  // Switching lands you at the new workspace's front door. Staying put would
  // leave the rail describing one business while the page shows another, and
  // there is no row in the new rail that takes you back to where you were.
  const onSelectWorkspace = React.useCallback(
    (id: string) => {
      select(id);
      const target = getWorkspaceSidebarModel({ ...modelArgs, activeWorkspaceId: id });
      if (target.homeHref && target.homeHref !== pathname) {
        router.push(target.homeHref);
      }
    },
    [modelArgs, pathname, router, select],
  );

  const activeHref = React.useMemo(
    () => getActiveNavHref(sidebarModel.sections, pathname, view),
    [pathname, sidebarModel.sections, view],
  );

  // No company name reaches the client today — only the slug — so the mark is
  // built from that and falls back to the workspace's own name. A real name
  // would be a lookup, which is a data change and not this one.
  const companyName = React.useMemo(() => {
    const slug = user?.companySlug;
    if (!slug) return sidebarModel.workspaceLabel;
    return slug
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join(" ");
  }, [sidebarModel.workspaceLabel, user?.companySlug]);

  return (
    <Sidebar
      collapsible="icon"
      // 280, split 56 and 224. The rail draws its own grounds and its own
      // hairlines, so the frame around it carries none of its own.
      className="sticky top-0 m-0 h-[100dvh] rounded-none border-none bg-transparent p-0 shadow-none [--sidebar-width:280px] [--sidebar-width-icon:56px]"
    >
      <WorkspaceRail
        sections={sidebarModel.sections}
        workspaceLabel={sidebarModel.workspaceLabel}
        companyName={companyName}
        activeHref={activeHref}
        supportItems={sidebarModel.supportItems}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setOpen(isCollapsed)}
        workspaces={sidebarModel.workspaces}
        activeWorkspaceId={sidebarModel.activeWorkspaceId}
        onSelectWorkspace={onSelectWorkspace}
        user={{ name: user?.name, image: user?.image }}
        accountMenu={
          <RailAccount name={user?.name} email={user?.email} image={user?.image} />
        }
      />
    </Sidebar>
  );
}

/**
 * The person, at the foot of tier one.
 *
 * Carries everything the old account block did — preferences, management,
 * users, sign out — plus the guided-tips switch, which used to sit on its own
 * at the bottom of the rail. A rail of places is no home for a setting.
 */
function RailAccount({
  name,
  email,
  image,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}) {
  const { enabled: guidedModeEnabled, setGuidedMode } = useGuidedMode();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${name ?? email ?? "Account"} — account`}
          className="cursor-pointer rounded-full border-0 bg-transparent p-0"
        >
          <RailAvatar src={image} name={name} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-60 p-1.5">
        <div className="flex items-center gap-2.5 px-2 pb-2.5 pt-1.5">
          <RailAvatar src={image} name={name} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-[var(--text-strong)]">
              {name ?? "Signed in"}
            </span>
            {email ? (
              <span className="block truncate text-[13px] leading-snug text-[var(--text-subtle)]">
                {email}
              </span>
            ) : null}
          </span>
        </div>
        <span className="mx-1.5 block h-px bg-[var(--border-subtle)]" />
        <div className="grid gap-px pt-1.5">
          {[
            { href: "/preferences/profile", label: "Profile" },
            { href: "/preferences/notifications", label: "Notifications" },
            { href: "/preferences/appearance", label: "Appearance" },
            { href: "/preferences/organization/users", label: "Users" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex h-8 items-center rounded-lg px-2 text-[13px] font-medium text-[var(--text-body)] hover:bg-[var(--border-subtle)]"
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setGuidedMode(!guidedModeEnabled)}
            className="flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium text-[var(--text-body)] hover:bg-[var(--border-subtle)]"
          >
            {guidedModeEnabled ? (
              <HelpCircle className="h-3.5 w-3.5 text-[var(--action-primary-bg)]" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-[var(--text-subtle)]" />
            )}
            <span className="flex-1">Guided tips</span>
          </button>
        </div>
        <span className="mx-1.5 mt-1.5 block h-px bg-[var(--border-subtle)]" />
        <Link
          href="/api/auth/signout"
          className="mt-1.5 flex h-8 items-center rounded-lg px-2 text-[13px] font-medium text-[var(--action-destructive-bg)] hover:bg-[var(--action-destructive-soft-bg)]"
        >
          Sign out
        </Link>
      </PopoverContent>
    </Popover>
  );
}
