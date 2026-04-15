"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { OfflineStatusIndicator } from "@/components/layout/offline-status-indicator";
import {
  BarChart3,
  Clock,
  History,
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
  "/portal/pos/reports": { title: "Reports", description: "Your sales at a glance" },
  "/shift": { title: "Shift Management" },
  "/portal/pos/shift": { title: "Shift Management" },
};

export function PosPortalLayoutFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isPosHost } = usePosPortalState();
  const { data: session } = useSession();

  // Login page should not be wrapped in the POS frame
  if (
    pathname === "/portal/pos/login" ||
    pathname === "/login"
  ) {
    return <>{children}</>;
  }

  const config = ROUTE_CONFIG[pathname] ?? { title: "Point of Sale" };

  const renderedLinks = isPosHost
    ? POS_PORTAL_LINKS.map((item) => ({ ...item, href: item.publicHref }))
    : POS_PORTAL_LINKS.map((item) => ({ ...item, href: item.internalHref }));

  return (
    <div className="text-[15px] text-[var(--text-strong)]">
      <div className="relative flex h-[100dvh] overflow-hidden lg:flex-row">
        {/* ── Sidebar ─────────────────────────────────────── */}
        <aside className="shrink-0 border-b border-[var(--edge-subtle)] bg-[var(--sidebar)] lg:w-[13.5rem] lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            {/* Operator identity */}
            <div className="hidden shrink-0 px-4 pt-5 pb-4 lg:block">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--action-primary-bg)_12%,var(--surface-base))] text-[var(--action-primary-bg)]">
                  <span className="text-[13px] font-black leading-none">
                    {(session?.user?.name || "O")[0].toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold leading-tight text-[var(--text-strong)]">
                    {session?.user?.name || "Operator"}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                    Cashier
                  </div>
                </div>
              </div>
            </div>

            <nav className="flex gap-1 overflow-x-auto px-3 pb-2 pt-2 lg:mt-0 lg:flex-1 lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:overflow-x-visible lg:px-3 lg:pb-3 lg:pt-0">
              {renderedLinks.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group inline-flex min-h-10 shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition-all duration-100 lg:flex lg:w-full",
                      isActive
                        ? "bg-[var(--surface-base)] font-semibold text-[var(--text-strong)] shadow-[0_1px_4px_rgba(0,0,0,0.08),inset_0_0_0_1px_var(--edge-default)]"
                        : "text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-base)_60%,transparent)] hover:text-[var(--text-strong)]",
                    )}
                  >
                    <item.icon className={cn(
                      "h-[1.05rem] w-[1.05rem] shrink-0 transition-colors",
                      isActive ? "text-[var(--action-primary-bg)]" : "opacity-70",
                    )} />
                    <span className="whitespace-nowrap">{item.label}</span>
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--action-primary-bg)]" />
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden shrink-0 border-t border-[var(--edge-subtle)] px-4 py-3 lg:block">
              <OfflineStatusIndicator />
            </div>
          </div>
        </aside>

        {/* ── Content area ────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!config.fillHeight ? (
            <>
              <header className="shrink-0 border-b border-[var(--edge-subtle)] bg-[var(--surface-base)] px-4 py-2.5 md:px-5">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="text-base font-semibold text-[var(--text-strong)]">{config.title}</h1>
                  <div className="shrink-0 lg:hidden">
                    <OfflineStatusIndicator />
                  </div>
                </div>
                {config.description ? (
                  <p className="mt-0.5 text-sm text-[var(--text-muted)]">{config.description}</p>
                ) : null}
              </header>
              <main className="flex-1 overflow-auto px-4 pb-8 pt-5 md:px-5 md:pb-10 md:pt-6">
                {children}
              </main>
            </>
          ) : (
            <main className="flex-1 overflow-hidden">
              {children}
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
