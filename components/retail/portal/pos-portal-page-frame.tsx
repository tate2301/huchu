import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { Clock, Dashboard, History, Package, Payments } from "@/lib/icons";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { cn } from "@/lib/utils";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";

const POS_PORTAL_LINKS = [
  { href: "/portal/pos/overview", label: "Overview", icon: Dashboard },
  { href: "/portal/pos", label: "Checkout", icon: Payments },
  { href: "/portal/pos/held", label: "Held", icon: Package },
  { href: "/portal/pos/history", label: "History", icon: History },
  { href: "/portal/pos/shift", label: "Shift", icon: Clock },
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

  await requirePageAuth({
    pathname,
    callbackUrl: portalRouting.callbackPath,
    loginPath: portalRouting.loginPath,
  });

  return (
    <div className="flex w-full flex-col gap-4 px-3 py-3 sm:px-4 lg:px-5">
      <div className="rounded-[1.5rem] bg-[var(--surface-base)] px-3 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PageHeading title={title} description={description} className="mb-0" />
          </div>
          <div className="overflow-auto pb-1">
            <div className="flex min-w-max gap-2">
              {POS_PORTAL_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors duration-150",
                    pathname === item.href
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
