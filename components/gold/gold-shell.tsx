"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRightLeft,
  AlertTriangle,
  BarChart3,
  Gem,
  PackageCheck,
  Scale,
} from "@/lib/icons";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { cn } from "@/lib/utils";
import { goldRoutes } from "@/app/gold/routes";

export type GoldLane =
  | "command"
  | "intake"
  | "transit"
  | "settlement"
  | "exceptions"
  | "reporting";

type GoldLaneItem = {
  id: GoldLane;
  label: string;
  href: string;
  icon: typeof Gem;
};

const laneTabs: GoldLaneItem[] = [
  { id: "command", label: "Home", href: goldRoutes.command, icon: Gem },
  {
    id: "intake",
    label: "Batches",
    href: goldRoutes.intake.pours,
    icon: PackageCheck,
  },
  {
    id: "transit",
    label: "Dispatch",
    href: goldRoutes.transit.dispatches,
    icon: ArrowRightLeft,
  },
  {
    id: "settlement",
    label: "Sales",
    href: goldRoutes.settlement.receipts,
    icon: Scale,
  },
  {
    id: "exceptions",
    label: "Issues",
    href: goldRoutes.exceptions.home,
    icon: AlertTriangle,
  },
  {
    id: "reporting",
    label: "Reports",
    href: goldRoutes.reporting.home,
    icon: BarChart3,
  },
];

type GoldShellProps = {
  activeTab: GoldLane;
  actions?: ReactNode;
  children: ReactNode;
  title?: string;
  description?: string;
};

export function GoldShell({
  activeTab,
  actions,
  children,
  title = "Gold Chain",
  description = "Track gold from shift output to sale and payout.",
}: GoldShellProps) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} description={description} />

      <nav
        aria-label="Gold sections"
        className="grid gap-2 rounded-lg border bg-card p-2 sm:grid-cols-3 lg:grid-cols-6"
      >
        {laneTabs.map((lane) => {
          const isActive = lane.id === activeTab;
          return (
            <Link
              key={lane.id}
              href={lane.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <lane.icon className="h-4 w-4" />
              <span>{lane.label}</span>
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
