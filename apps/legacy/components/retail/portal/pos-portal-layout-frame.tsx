"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@corelithzw/ui/components/tooltip";
import {
  BarChart3,
  Clock,
  CloudOff,
  FileText,
  History,
  Home,
  Keyboard,
  LogOut,
  Package,
  Payments,
  Search,
  Settings2,
  Users,
  type LucideIcon,
} from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";
import { OfflineStatusButton } from "@/components/layout/offline-status-button";
import { usePosPortalState } from "./pos-portal-state";

type PosPortalLink = {
  label: string;
  icon: LucideIcon;
  publicHref: string;
  internalHref: string;
  /**
   * Shown in the phone bottom bar as well as the tablet rail.
   *
   * The two are not the same list on purpose. The rail is vertical and takes
   * every screen; the bottom bar divides one width between its tabs, so at nine
   * tabs on a 390px phone each one is 43px — under the 44px minimum touch
   * target, on a surface where the user is holding a customer's change. The
   * tablet is the till's actual device and gets everything.
   */
  onPhone?: boolean;
};

type PosPortalLayoutFrameProps = {
  children: ReactNode;
  workspaceName: string;
  workspaceInitial: string;
};

/**
 * In the order a cashier reaches for them, not alphabetically.
 *
 * Overview, Price check and Customers had routes, components and data and were
 * in no rail at all — built and unreachable. Price check was the costly one: a
 * customer asks what something costs and the person behind the counter had no
 * button for it.
 */
const POS_PORTAL_LINKS: PosPortalLink[] = [
  { label: "Checkout", icon: Payments, publicHref: "/", internalHref: "/portal/pos", onPhone: true },
  // Mid-sale, and the reason this list was wrong.
  {
    label: "Price",
    icon: Search,
    publicHref: "/price-check",
    internalHref: "/portal/pos/price-check",
    onPhone: true,
  },
  { label: "Held", icon: Package, publicHref: "/held", internalHref: "/portal/pos/held", onPhone: true },
  {
    label: "Customers",
    icon: Users,
    publicHref: "/customers",
    internalHref: "/portal/pos/customers",
  },
  {
    label: "History",
    icon: History,
    publicHref: "/history",
    internalHref: "/portal/pos/history",
    onPhone: true,
  },
  { label: "Shift", icon: Clock, publicHref: "/shift", internalHref: "/portal/pos/shift", onPhone: true },
  { label: "Reports", icon: BarChart3, publicHref: "/reports", internalHref: "/portal/pos/reports" },
  { label: "Today", icon: Home, publicHref: "/overview", internalHref: "/portal/pos/overview" },
  // S-7.3. The till sells with the line down and the cashier could not see what
  // was waiting to go up. Last because it is the one you check, not the one you
  // work in — but on the phone too, because a queue you cannot see is the whole
  // problem it exists to solve.
  {
    label: "Offline",
    icon: CloudOff,
    publicHref: "/offline",
    internalHref: "/portal/pos/offline",
    onPhone: true,
  },
];

/**
 * The reference screens, behind the operator badge rather than in the rail.
 *
 * S-7.6 added Activity, Settings and Help — the three the contract names and
 * the till never had — and the rail cannot hold them. It is a fixed 768px
 * column on the till's tablet: the workspace block, twelve 44px targets, their
 * gaps and the footer come to roughly 850px, so the last three entries sat
 * below the fold and had to be scrolled to. Shrinking the targets was not an
 * option; 44px is the floor for a finger.
 *
 * Grouping them here is the honest fit rather than a compromise. These are the
 * screens you *consult* — what has this till done, how is it set up, how does
 * this work — and they belong with who you are and how to sign out, which is
 * exactly what the operator badge already stands for. The nine you work in stay
 * one tap away in the rail, and nothing scrolls.
 */
const POS_PORTAL_MENU_LINKS: PosPortalLink[] = [
  { label: "Activity", icon: FileText, publicHref: "/activity", internalHref: "/portal/pos/activity" },
  { label: "Till settings", icon: Settings2, publicHref: "/settings", internalHref: "/portal/pos/settings" },
  { label: "Help & shortcuts", icon: Keyboard, publicHref: "/help", internalHref: "/portal/pos/help" },
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
  "/offline": { title: "Offline queue", description: "Waiting to reach the server" },
  "/portal/pos/offline": {
    title: "Offline queue",
    description: "Waiting to reach the server",
  },
  "/price-check": { title: "Price check", description: "Scan or search for an item" },
  "/portal/pos/price-check": {
    title: "Price check",
    description: "Scan or search for an item",
  },
  "/customers": { title: "Customers" },
  "/portal/pos/customers": { title: "Customers" },
  "/overview": { title: "Today", description: "Your shift so far" },
  "/portal/pos/overview": { title: "Today", description: "Your shift so far" },
  "/activity": { title: "Activity", description: "What this till has done" },
  "/portal/pos/activity": { title: "Activity", description: "What this till has done" },
  "/settings": { title: "Till settings", description: "How this terminal is set up" },
  "/portal/pos/settings": {
    title: "Till settings",
    description: "How this terminal is set up",
  },
  "/help": { title: "Help", description: "Keys, everyday jobs, and what to do when it goes wrong" },
  "/portal/pos/help": {
    title: "Help",
    description: "Keys, everyday jobs, and what to do when it goes wrong",
  },
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
  // The rail takes everything; the phone bar takes the ones you touch mid-sale.
  // See `onPhone` on `PosPortalLink` for why the two lists differ.
  const phoneLinks = renderedLinks.filter((item) => item.onPhone);
  // Same host-dependent href swap, for the operator menu.
  const renderedMenuLinks = POS_PORTAL_MENU_LINKS.map((item) => ({
    ...item,
    href: isPosHost ? item.publicHref : item.internalHref,
  }));

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
                {/*
                  The operator badge was a `cursor-default` div with a tooltip.
                  It is now the door to the reference screens and to signing out
                  — see `POS_PORTAL_MENU_LINKS` for why they are not in the rail.
                  44px, because it is a real target on a touch screen now.
                */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${session?.user?.name || "Operator"} — till menu`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors"
                      style={{
                        borderColor: "var(--pos-rail-border)",
                        background: "var(--pos-amount-surface)",
                        color: "var(--pos-amount-text)",
                      }}
                    >
                      <span className="text-[13px] font-black leading-none">{operatorInitial}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start" className="min-w-[15rem]">
                    <DropdownMenuLabel className="flex flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold text-[var(--text-strong)]">
                        {session?.user?.name || "Operator"}
                      </span>
                      <span className="truncate text-xs font-normal text-[var(--text-muted)]">
                        {workspaceName}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {renderedMenuLinks.map((item) => (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link href={item.href} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={handleSignOut}>
                      <LogOut className="h-4 w-4 shrink-0" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Nav links */}
            <TooltipProvider delayDuration={120}>
              {/*
                Nine 44px targets, and the gap closes up on a short screen so
                they all fit a 768px tablet without scrolling. The targets stay
                44px — the gap gives, the target never does.
              */}
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2.5 pb-3 pt-3 [@media(min-height:820px)]:gap-1.5">
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

              {/*
                Device sync. Log out moved up into the operator menu, where it
                sits with the rest of "you and this terminal" — and where it is
                one deliberate extra tap away from a thumb resting at the bottom
                of the rail mid-sale.

                The till does not use the app navbar, so the offline control
                that now lives there needs a home here too. Tinted for the dark
                rail; `cn` lets these classes win the conflict.
              */}
              <div
                className="flex shrink-0 items-center justify-center px-2.5 py-3"
                style={{ borderTop: "1px solid var(--pos-rail-border)" }}
              >
                <OfflineStatusButton className="size-11 w-full text-[var(--pos-rail-text-idle)] [--offline-dot-ring:var(--pos-rail-bg)] hover:bg-[var(--pos-rail-active-bg)] hover:text-[var(--pos-rail-text-active)]" />
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
            {/* Below `lg` the rail is gone, so the phone header carries it. */}
            <OfflineStatusButton className="shrink-0 text-[var(--pos-amount-label)] [--offline-dot-ring:var(--pos-amount-bg)] hover:bg-[var(--pos-rail-active-bg)] hover:text-[var(--pos-amount-text)]" />
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
        <BottomTabBar links={phoneLinks} pathname={pathname} onSignOut={handleSignOut} />
      </div>
    </div>
  );
}
