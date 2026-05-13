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
  { label: "Checkout", icon: Payments, publicHref: "/", internalHref: "/portal/pos" },
  { label: "Held", icon: Package, publicHref: "/held", internalHref: "/portal/pos/held" },
  { label: "History", icon: History, publicHref: "/history", internalHref: "/portal/pos/history" },
  { label: "Reports", icon: BarChart3, publicHref: "/reports", internalHref: "/portal/pos/reports" },
  { label: "Shift", icon: Clock, publicHref: "/shift", internalHref: "/portal/pos/shift" },
];

const ROUTE_CONFIG: Record<string, { title: string; description?: string; fillHeight?: boolean }> = {
  "/portal/pos": { title: "Point of Sale", fillHeight: true },
  "/": { title: "Point of Sale", fillHeight: true },
  "/held": { title: "Held Carts" },
  "/portal/pos/held": { title: "Held Carts" },
  "/history": { title: "Sales History" },
  "/portal/pos/history": { title: "Sales History" },
  "/reports": { title: "Reports", description: "Your sales at a glance" },
  "/portal/pos/reports": { title: "Reports", description: "Your sales at a glance" },
  "/shift": { title: "Shift Management" },
  "/portal/pos/shift": { title: "Shift Management" },
};

function BottomTabBar({
  links,
  pathname,
  onSignOut,
}: {
  links: Array<{ href: string; label: string; icon: LucideIcon }>;
  pathname: string;
  onSignOut: () => void;
}) {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex lg:hidden"
      style={{
        background: "var(--pos-rail-bg)",
        borderTop: "1px solid var(--pos-rail-border)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {links.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className="relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors"
            style={{ color: isActive ? "var(--pos-rail-text-active)" : "var(--pos-rail-text-idle)" }}
          >
            {isActive && (
              <span
                className="absolute inset-x-3 top-0 h-[2px] rounded-b-full"
                style={{ background: "var(--pos-cta-bg)" }}
              />
            )}
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="text-[9px] font-bold uppercase tracking-wide leading-none">
              {item.label}
            </span>
          </Link>
        );
      })}
      <button
        type="button"
        aria-label="Log out"
        onClick={onSignOut}
        className="flex min-h-[3.25rem] min-w-[3.5rem] flex-col items-center justify-center gap-0.5 py-2 transition-colors"
        style={{ color: "var(--pos-rail-text-idle)" }}
      >
        <LogOut className="h-5 w-5 shrink-0" />
        <span className="text-[9px] font-bold uppercase tracking-wide leading-none">Exit</span>
      </button>
    </nav>
  );
}

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
    <div
      className="pos-terminal min-h-[100dvh] text-[15px] text-[var(--text-strong)]"
      style={{ background: "var(--surface-canvas)" }}
    >
      <div
        className="relative flex h-[100dvh] overflow-hidden lg:flex-row"
        style={{ background: "var(--surface-canvas)" }}
      >
        {/* Desktop sidebar — dark rail */}
        <aside
          className="hidden shrink-0 lg:flex lg:w-[5.5rem] 3xl:w-[6.5rem]"
          style={{
            background: "var(--pos-rail-bg)",
            borderRight: "1px solid var(--pos-rail-border)",
          }}
        >
          <div className="flex h-full w-full flex-col">
            {/* Workspace badge */}
            <div
              className="shrink-0 px-3 py-4"
              style={{ borderBottom: "1px solid var(--pos-rail-border)" }}
            >
              <div className="flex flex-col items-center gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white"
                  style={{
                    background: "var(--pos-cta-bg)",
                    boxShadow: "var(--pos-rail-workspace-shadow)",
                  }}
                >
                  {workspaceInitial}
                </div>
                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex h-9 w-9 cursor-default items-center justify-center rounded-full border"
                        style={{
                          borderColor: "var(--pos-rail-border)",
                          background: "var(--pos-amount-surface)",
                          color: "var(--pos-amount-text)",
                        }}
                      >
                        <span className="text-[13px] font-black leading-none">{operatorInitial}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {session?.user?.name || "Operator"} · {workspaceName}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Nav links */}
            <TooltipProvider delayDuration={120}>
              <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 pb-3 pt-3">
                {renderedLinks.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          aria-label={item.label}
                          aria-current={isActive ? "page" : undefined}
                          className="relative inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl transition-all duration-100"
                          style={
                            isActive
                              ? {
                                  background: "var(--pos-rail-active-bg)",
                                  boxShadow: `inset 0 0 0 1px var(--pos-rail-active-ring)`,
                                  color: "var(--pos-rail-text-active)",
                                }
                              : { color: "var(--pos-rail-text-idle)" }
                          }
                        >
                          {isActive && (
                            <span
                              className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                              style={{ background: "var(--pos-cta-bg)" }}
                            />
                          )}
                          <span className="relative flex h-9 w-9 items-center justify-center">
                            <item.icon className="h-[1.1rem] w-[1.1rem] shrink-0" />
                          </span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </nav>

              {/* Logout */}
              <div
                className="shrink-0 px-2.5 py-3"
                style={{ borderTop: "1px solid var(--pos-rail-border)" }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Log out"
                      onClick={handleSignOut}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl transition-all duration-100"
                      style={{ color: "var(--pos-rail-text-idle)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--pos-rail-text-active)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--pos-rail-text-idle)")
                      }
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

        {/* Content area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Mobile header */}
          <header
            className="flex items-center justify-between gap-3 px-4 py-3 lg:hidden"
            style={{
              background: "var(--pos-amount-bg)",
              borderBottom: "1px solid var(--pos-rail-border)",
            }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] text-sm font-black text-white"
                style={{ background: "var(--pos-cta-bg)" }}
              >
                {workspaceInitial}
              </div>
              <div className="min-w-0">
                <div
                  className="truncate text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: "var(--pos-amount-label)" }}
                >
                  POS Terminal
                </div>
                <div
                  className="truncate text-sm font-bold"
                  style={{ color: "var(--pos-amount-text)" }}
                >
                  {config.title}
                </div>
              </div>
            </div>
          </header>

          {config.fillHeight ? (
            <main className="flex-1 overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
              {children}
            </main>
          ) : (
            <main
              className={cn(
                "flex-1 overflow-auto px-4 pt-5 md:px-6 lg:px-8 lg:pb-6",
                "pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))]",
              )}
            >
              <div className="mx-auto w-full max-w-[1320px] 3xl:max-w-[1680px]">
                <div className="mb-5 hidden lg:block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    POS Terminal
                  </div>
                  <h1 className="mt-1 text-[1.45rem] font-bold tracking-[-0.03em] text-[var(--text-strong)]">
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

        {/* Mobile bottom tab bar */}
        <BottomTabBar links={renderedLinks} pathname={pathname} onSignOut={handleSignOut} />
      </div>
    </div>
  );
}
