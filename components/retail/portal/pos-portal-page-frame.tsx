import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
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
import { isCashierRole } from "@/lib/retail/pos-host";
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
  if (!isCashierRole(session.user.role)) {
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
        <aside className="h-full w-full bg-[var(--sidebar)] p-4">
          <div className="px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              POS portal
            </div>
            <div className="mt-1 text-sm font-semibold">{session.user.name || "Cashier"}</div>
          </div>
          <nav className="mt-5 space-y-1.5">
            {renderedLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-2.5 text-base font-semibold transition-all duration-[160ms]",
                  publicPathname === item.href || pathname === item.href
                    ? "bg-[var(--surface-base)]"
                    : "text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.4)]",
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
                  <item.icon className="h-5 w-5" />
                </div>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 p-2">
          <div className="overflow-clip rounded-xl bg-[var(--surface-base)]">
            <header className="border-b border-[var(--edge-subtle)] px-4 py-3 md:px-5">
              <PageHeading title={title} description={description} className="mb-0" />
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
