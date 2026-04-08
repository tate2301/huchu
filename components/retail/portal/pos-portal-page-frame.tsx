import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { Clock, Dashboard, History, Package, Payments, type LucideIcon } from "@/lib/icons";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { isCashierRole } from "@/lib/retail/pos-host";
import { cn } from "@/lib/utils";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { getPortalHostDescriptorByPath, getPortalPublicPathForInternalPath } from "@/lib/platform/portal-hosts";

type PosPortalLink = {
  label: string;
  icon: LucideIcon;
  publicHref: string | null;
  internalHref: string;
  visibleToCashiers: boolean;
};

const POS_PORTAL_LINKS: PosPortalLink[] = [
  {
    label: "Overview",
    icon: Dashboard,
    publicHref: null,
    internalHref: "/portal/pos/overview",
    visibleToCashiers: false,
  },
  {
    label: "Checkout",
    icon: Payments,
    publicHref: "/",
    internalHref: "/portal/pos",
    visibleToCashiers: true,
  },
  {
    label: "Held",
    icon: Package,
    publicHref: "/held",
    internalHref: "/portal/pos/held",
    visibleToCashiers: true,
  },
  {
    label: "History",
    icon: History,
    publicHref: "/history",
    internalHref: "/portal/pos/history",
    visibleToCashiers: true,
  },
  {
    label: "Shift",
    icon: Clock,
    publicHref: "/shift",
    internalHref: "/portal/pos/shift",
    visibleToCashiers: true,
  },
] as const;

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
  const isCashier = isCashierRole(session.user.role);
  const portalDescriptor = getPortalHostDescriptorByPath("/portal/pos");
  const publicPathname =
    portalRouting.isPortalHost && portalDescriptor
      ? getPortalPublicPathForInternalPath(pathname, portalDescriptor) ?? pathname
      : pathname;

  const visibleLinks = POS_PORTAL_LINKS.filter((item) => !isCashier || item.visibleToCashiers);
  const renderedLinks = portalRouting.isPortalHost
    ? visibleLinks
        .filter((item) => item.publicHref !== null)
        .map((item) => ({
          ...item,
          href: item.publicHref as string,
        }))
    : visibleLinks.map((item) => ({
        ...item,
        href: item.internalHref,
      }));

  return (
    <div className="flex w-full flex-col gap-4 px-3 py-3 sm:px-4 lg:px-5">
      <div className="rounded-[1.5rem] bg-[var(--surface-base)] px-3 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PageHeading title={title} description={description} className="mb-0" />
          </div>
          <div className="overflow-auto pb-1">
            <div className="flex min-w-max gap-2">
              {renderedLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors duration-150",
                    publicPathname === item.href || pathname === item.href
                      ? "bg-[var(--action-primary-bg)] text-white"
                      : "bg-[var(--surface-muted)] text-[var(--text-body)] hover:bg-[var(--action-secondary-bg)]",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
