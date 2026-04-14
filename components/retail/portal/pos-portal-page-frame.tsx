import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { OfflineStatusIndicator } from "@/components/layout/offline-status-indicator";
import { PageHeading } from "@/components/layout/page-heading";
import {
  Clock,
  History,
  Home,
  Package,
  Payments,
  ReceiptLong,
  User,
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
    label: "Overview",
    icon: Home,
    publicHref: "/overview",
    internalHref: "/portal/pos/overview",
  },
  {
    label: "Checkout",
    icon: Payments,
    publicHref: "/",
    internalHref: "/portal/pos",
  },
  {
    label: "Price check",
    icon: ReceiptLong,
    publicHref: "/price-check",
    internalHref: "/portal/pos/price-check",
  },
  {
    label: "Customers",
    icon: User,
    publicHref: "/customers",
    internalHref: "/portal/pos/customers",
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
  children: ReactNode;
};

export async function PosPortalPageFrame({
  pathname,
  title,
  description,
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
    <div className="admin-shell-frame text-[15px] text-[var(--text-strong)]">
      <div className="admin-shell-window relative overflow-hidden lg:grid lg:min-h-[calc(100vh-1rem)] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="h-full w-full border-b border-[var(--edge-subtle)] bg-[var(--sidebar)] px-3 pb-3 pt-3 lg:border-b-0 lg:border-r lg:px-4 lg:py-4">
          <div className="px-1 lg:px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Store operations
            </div>
            <div className="mt-1 text-sm font-semibold">{session.user.name || "Operator"}</div>
          </div>
          <nav className="mt-4 flex gap-1.5 overflow-x-auto pb-1 lg:mt-5 lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0">
            {renderedLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 text-[14px] font-semibold transition-all duration-[160ms] lg:flex lg:min-h-12 lg:w-full lg:rounded-xl lg:px-4 lg:py-2.5 lg:text-base",
                  publicPathname === item.href || pathname === item.href
                    ? "bg-[var(--surface-base)] text-[var(--text-strong)] shadow-[inset_0_0_0_1px_var(--edge-default)]"
                    : "text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-base)_68%,transparent)]",
                )}
              >
                <div
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-[10px]",
                    publicPathname === item.href || pathname === item.href
                      ? "text-[var(--text-strong)]"
                      : "text-[var(--text-muted)]",
                  )}
                >
                  <item.icon className="h-4 w-4 lg:h-5 lg:w-5" />
                </div>
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 p-2">
          <div className="overflow-clip rounded-xl bg-[var(--surface-base)]">
            <header className="border-b border-[var(--edge-subtle)] px-4 py-3 md:px-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <PageHeading title={title} className="mb-0" />
                  {description ? (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
                  ) : null}
                </div>
                <div className="shrink-0">
                  <OfflineStatusIndicator />
                </div>
              </div>
            </header>
            <main className="min-w-0 px-4 pb-8 pt-5 md:pb-10 md:pt-6">
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
