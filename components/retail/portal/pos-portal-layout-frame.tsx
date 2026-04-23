"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart3,
  Clock,
  History,
  LogOut,
  Package,
  Payments,
  type LucideIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { usePosPortalState } from "./pos-portal-state";

type PosPortalLink = {
  label: string;
  icon: LucideIcon;
  publicHref: string;
  internalHref: string;
};

type PosPortalLayoutFrameProps = {
  children: ReactNode;
  workspaceName: string;
  workspaceInitial: string;
};

const POS_PORTAL_LINKS: PosPortalLink[] = [
  {
    label: "Checkout",
    icon: Payments,
    publicHref: "/",
    internalHref: "/portal/pos",
  },
  {
    label: "Held",
    icon: Package,
    publicHref: "/held",
    internalHref: "/portal/pos/held",
  },
  {
    label: "History",
    icon: History,
    publicHref: "/history",
    internalHref: "/portal/pos/history",
  },
  {
    label: "Reports",
    icon: BarChart3,
    publicHref: "/reports",
    internalHref: "/portal/pos/reports",
  },
  {
    label: "Shift",
    icon: Clock,
    publicHref: "/shift",
    internalHref: "/portal/pos/shift",
  },
];

const ROUTE_CONFIG: Record<
  string,
  { title: string; description?: string; fillHeight?: boolean }
> = {
  "/portal/pos": { title: "Point of Sale", fillHeight: true },
  "/": { title: "Point of Sale", fillHeight: true },
  "/held": { title: "Held Carts" },
  "/portal/pos/held": { title: "Held Carts" },
  "/history": { title: "Sales History" },
  "/portal/pos/history": { title: "Sales History" },
  "/reports": { title: "Reports", description: "Your sales at a glance" },
  "/portal/pos/reports": {
    title: "Reports",
    description: "Your sales at a glance",
  },
  "/shift": { title: "Shift Management" },
  "/portal/pos/shift": { title: "Shift Management" },
};

export function PosPortalLayoutFrame({
  children,
  workspaceName,
  workspaceInitial,
}: PosPortalLayoutFrameProps) {
  const pathname = usePathname();
  const { isPosHost } = usePosPortalState();
  const { data: session } = useSession();
  const operatorInitial = (session?.user?.name || "O")[0]?.toUpperCase() || "O";

  const handleSignOut = () => {
    void signOut({
      redirect: true,
      callbackUrl: isPosHost ? "/login" : "/portal/pos/login",
    });
  };

  if (pathname === "/portal/pos/login" || pathname === "/login") {
    return <>{children}</>;
  }

  const config = ROUTE_CONFIG[pathname] ?? { title: "Point of Sale" };
  const renderedLinks = isPosHost
    ? POS_PORTAL_LINKS.map((item) => ({ ...item, href: item.publicHref }))
    : POS_PORTAL_LINKS.map((item) => ({ ...item, href: item.internalHref }));

  return (
    <div className="min-h-screen bg-[color-mix(in_srgb,var(--surface-canvas)_88%,white)] text-[15px] text-[var(--text-strong)]">
      <div className="relative flex h-[100dvh] overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-canvas)_90%,white)_0%,var(--surface-base)_100%)] lg:flex-row">
        <aside className="shrink-0 border-b border-[var(--edge-subtle)] bg-[color-mix(in_srgb,var(--sidebar)_94%,white)] lg:flex lg:w-[5.5rem] lg:border-b-0 lg:border-r">
          <div className="flex h-full w-full flex-col">
            <div className="hidden shrink-0 border-b border-[var(--edge-subtle)] px-3 py-4 lg:block">
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.15rem] bg-[var(--action-primary-bg)] text-sm font-black text-white shadow-[0_12px_24px_rgba(15,23,42,0.14)]">
                  {workspaceInitial}
                </div>
                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex h-9 w-9 cursor-default items-center justify-center rounded-full border border-[var(--edge-subtle)] bg-[var(--surface-base)] text-[var(--action-primary-bg)]">
                        <span className="text-[13px] font-black leading-none">
                          {operatorInitial}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {session?.user?.name || "Operator"} · {workspaceName}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <TooltipProvider delayDuration={120}>
              <nav className="flex gap-1 overflow-x-auto px-3 pb-2 pt-2 lg:flex-1 lg:flex-col lg:gap-2 lg:overflow-y-auto lg:overflow-x-visible lg:px-3 lg:pb-3 lg:pt-4">
                {renderedLinks.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          aria-label={item.label}
                          className={cn(
                            "group inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl px-2.5 py-2.5 text-[13px] font-medium transition-all duration-100 lg:flex lg:w-full",
                            isActive
                              ? "bg-[var(--surface-base)] text-[var(--text-strong)] shadow-[0_8px_18px_rgba(15,23,42,0.08),inset_0_0_0_1px_var(--edge-default)]"
                              : "text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-base)_60%,transparent)] hover:text-[var(--text-strong)]",
                          )}
                        >
                          <span className="relative flex h-9 w-9 items-center justify-center rounded-[1rem]">
                            <item.icon
                              className={cn(
                                "h-[1.1rem] w-[1.1rem] shrink-0 transition-colors",
                                isActive ? "text-[var(--action-primary-bg)]" : "opacity-80",
                              )}
                            />
                            {isActive ? (
                              <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-[var(--action-primary-bg)]" />
                            ) : null}
                          </span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </nav>

              <div className="hidden shrink-0 border-t border-[var(--edge-subtle)] px-3 py-3 lg:block">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Log out"
                      onClick={handleSignOut}
                      className="inline-flex w-full items-center justify-center rounded-2xl px-2.5 py-2.5 text-left text-[13px] font-medium text-[var(--text-muted)] transition-all duration-100 hover:bg-[color-mix(in_srgb,var(--surface-base)_60%,transparent)] hover:text-[var(--text-strong)]"
                    >
                      <LogOut className="h-[1.05rem] w-[1.05rem] shrink-0 opacity-80" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Log out</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--edge-subtle)] bg-[color-mix(in_srgb,var(--surface-base)_88%,white)] px-4 py-3 lg:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] bg-[var(--action-primary-bg)] text-sm font-black text-white">
                {workspaceInitial}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  POS Workspace
                </div>
                <div className="truncate text-sm font-semibold text-[var(--text-strong)]">
                  {config.title}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </header>

          {config.fillHeight ? (
            <main className="flex-1 overflow-hidden">{children}</main>
          ) : (
            <main className="flex-1 overflow-auto px-4 pb-6 pt-5 md:px-6 lg:px-8">
              <div className="mx-auto w-full max-w-[1320px]">
                <div className="mb-5 hidden lg:block">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    POS Workspace
                  </div>
                  <h1 className="mt-1 text-[1.45rem] font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
                    {config.title}
                  </h1>
                  {config.description ? (
                    <p className="mt-2 max-w-[56ch] text-sm text-[var(--text-muted)]">
                      {config.description}
                    </p>
                  ) : null}
                </div>
                {children}
              </div>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
