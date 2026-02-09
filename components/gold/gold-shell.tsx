"use client";

import Link from "next/link";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { cn } from "@/lib/utils";
import {
  Coins,
  FileCheck,
  FileText,
  Home,
  Package,
  Wallet,
  Shield,
  type LucideIcon,
} from "lucide-react";

export type GoldTab =
  | "overview"
  | "pour"
  | "dispatch"
  | "receipt"
  | "reconciliation"
  | "payouts"
  | "audit";

type GoldTabItem = {
  id: GoldTab;
  label: string;
  href: string;
  icon: LucideIcon;
};

const goldTabs: GoldTabItem[] = [
  { id: "overview", label: "Overview", href: "/gold", icon: Home },
  { id: "pour", label: "Record Pour", href: "/gold/pour", icon: Coins },
  { id: "dispatch", label: "Dispatch", href: "/gold/dispatch", icon: Package },
  { id: "receipt", label: "Buyer Receipt", href: "/gold/receipt", icon: FileCheck },
  { id: "payouts", label: "Worker Payouts", href: "/gold/payouts", icon: Wallet },
  {
    id: "reconciliation",
    label: "Reconciliation",
    href: "/gold/reconciliation",
    icon: Shield,
  },
  { id: "audit", label: "Audit Trail", href: "/gold/audit", icon: FileText },
];

type GoldShellProps = {
  activeTab: GoldTab;
  actions?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
};

export function GoldShell({
  activeTab,
  actions,
  children,
  title = "Gold Control",
  description = "High-security workflows",
}: GoldShellProps) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} description={description} />

      <nav
        aria-label="Gold control navigation"
        className="flex w-full flex-wrap justify-start gap-2 border-b bg-transparent p-0"
      >
        {goldTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-semibold transition-colors border-b border-transparent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="size-5" />
              <span className="ml-2">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
