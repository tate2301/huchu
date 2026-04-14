import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
import { requirePageAuth } from "@/lib/auth-core/guards";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { cn } from "@/lib/utils";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { getPortalHostDescriptorByPath, getPortalPublicPathForInternalPath } from "@/lib/platform/portal-hosts";

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

type PosPortalPageFrameProps = {
  pathname: string;
  title: string;
  description?: string;
  /** When true the main area fills remaining viewport height with no padding (for checkout). */
  fillHeight?: boolean;
  children: ReactNode;
};

export async function PosPortalPageFrame({
  pathname,
  title,
  description,
  fillHeight = false,
  children,
}: PosPortalPageFrameProps) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/pos");
  const session = await requirePageAuth({
    pathname,
    callbackUrl: portalRouting.callbackPath,
    loginPath: portalRouting.loginPath,
  });
  if (!canAccessPosPortal(session.user.role)) {
    redirect("/access-blocked");
  }

  const portalDescriptor = getPortalHostDescriptorByPath("/portal/pos");
  const publicPathname =
    portalRouting.isPortalHost && portalDescriptor
      ? getPortalPublicPathForInternalPath(pathname, portalDescriptor) ?? pathname
      : pathname;

  const renderedLinks = portalRouting.isPortalHost
    ? POS_PORTAL_LINKS.map((item) => ({ ...item, href: item.publicHref }))
    : POS_PORTAL_LINKS.map((item) => ({ ...item, href: item.internalHref }));

  return (
    <div className="text-[15px] text-[var(--text-strong)]">
      <div className="relative flex h-[100dvh] overflow-hidden lg:flex-row">
        {/* ── Sidebar ─────────────────────────────────────── */}
        <aside className="shrink-0 border-b border-[var(--edge-subtle)] bg-[var(--sidebar)] lg:w-[13rem] lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            {/* Wordmark */}
            <div className="hidden shrink-0 px-4 pt-5 pb-3 lg:block">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">POS</div>
              <div className="mt-0.5 truncate text-[13px] font-bold text-[var(--text-strong)]">
                {session.user.name || "Operator"}
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-3 pb-2 pt-2 lg:mt-1 lg:flex-1 lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:overflow-x-visible lg:px-2.5 lg:pb-3 lg:pt-0">
              {renderedLinks.map((item) => {
                const isActive = publicPathname === item.href || pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group inline-flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-100 lg:flex lg:w-full",
                      isActive
                        ? "bg-[var(--surface-base)] text-[var(--text-strong)] shadow-[0_1px_3px_rgba(0,0,0,0.07),inset_0_0_0_1px_var(--edge-default)]"
                        : "text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-base)_70%,transparent)] hover:text-[var(--text-strong)]",
                    )}
                  >
                    <item.icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-[var(--action-primary-bg)]" : "")} />
                    <span className="whitespace-nowrap">{item.label}</span>
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
          {!fillHeight ? (
            <>
              <header className="shrink-0 border-b border-[var(--edge-subtle)] bg-[var(--surface-base)] px-4 py-2.5 md:px-5">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="text-base font-semibold text-[var(--text-strong)]">{title}</h1>
                  <div className="shrink-0 lg:hidden">
                    <OfflineStatusIndicator />
                  </div>
                </div>
                {description ? (
                  <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p>
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
