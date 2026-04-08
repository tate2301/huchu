import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import {
  Clock,
  History,
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
    <div className="grid min-h-[calc(100vh-1rem)] gap-3 px-3 py-3 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] p-3">
        <div className="px-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            POS portal
          </div>
          <div className="mt-1 text-sm font-semibold">{session.user.name || "Cashier"}</div>
        </div>
        <nav className="mt-3 space-y-1">
          {renderedLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                publicPathname === item.href || pathname === item.href
                  ? "bg-[var(--text-strong)] text-white"
                  : "text-[var(--text-body)] hover:bg-[var(--surface-muted)]",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <div className="space-y-3">
        <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] px-3 py-3">
          <PageHeading title={title} description={description} className="mb-0" />
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
