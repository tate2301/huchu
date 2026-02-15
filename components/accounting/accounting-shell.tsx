"use client";

import Link from "next/link";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { cn } from "@/lib/utils";
import {
  type LucideIcon,
  ArrowRightLeft,
  BarChart3,
  Calendar,
  Checklist,
  FileCheck,
  ManageAccounts,
  Package,
  PackageCheck,
  QrCode,
  ReceiptLong,
  Scale,
  ShieldCheck,
  TableRows,
  Wallet,
} from "@/lib/icons";

export type AccountingTab =
  | "overview"
  | "chart-of-accounts"
  | "journals"
  | "periods"
  | "trial-balance"
  | "financials"
  | "posting-rules"
  | "sales"
  | "purchases"
  | "banking"
  | "assets"
  | "budgets"
  | "cost-centers"
  | "currency"
  | "tax"
  | "fiscalisation";

type AccountingTabItem = {
  id: AccountingTab;
  label: string;
  href: string;
  icon: LucideIcon;
};

const accountingTabs: AccountingTabItem[] = [
  { id: "overview", label: "Overview", href: "/accounting", icon: Scale },
  {
    id: "chart-of-accounts",
    label: "Chart of Accounts",
    href: "/accounting/chart-of-accounts",
    icon: TableRows,
  },
  { id: "journals", label: "Journals", href: "/accounting/journals", icon: FileCheck },
  { id: "periods", label: "Periods", href: "/accounting/periods", icon: Calendar },
  {
    id: "trial-balance",
    label: "Trial Balance",
    href: "/accounting/trial-balance",
    icon: BarChart3,
  },
  {
    id: "financials",
    label: "Financials",
    href: "/accounting/financial-statements",
    icon: BarChart3,
  },
  {
    id: "posting-rules",
    label: "Posting Rules",
    href: "/accounting/posting-rules",
    icon: Checklist,
  },
  { id: "sales", label: "Sales", href: "/accounting/sales", icon: ReceiptLong },
  {
    id: "purchases",
    label: "Purchases",
    href: "/accounting/purchases",
    icon: PackageCheck,
  },
  { id: "banking", label: "Banking", href: "/accounting/banking", icon: Wallet },
  { id: "assets", label: "Assets", href: "/accounting/assets", icon: Package },
  { id: "budgets", label: "Budgets", href: "/accounting/budgets", icon: BarChart3 },
  {
    id: "cost-centers",
    label: "Cost Centers",
    href: "/accounting/cost-centers",
    icon: ManageAccounts,
  },
  {
    id: "currency",
    label: "Currency",
    href: "/accounting/currency",
    icon: ArrowRightLeft,
  },
  { id: "tax", label: "Tax", href: "/accounting/tax", icon: ShieldCheck },
  {
    id: "fiscalisation",
    label: "Fiscalisation",
    href: "/accounting/fiscalisation",
    icon: QrCode,
  },
];

type AccountingShellProps = {
  activeTab: AccountingTab;
  actions?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
};

export function AccountingShell({
  activeTab,
  actions,
  children,
  title = "Accounting",
  description = "Ledger, journals, and finance controls",
}: AccountingShellProps) {
  return (
    <div className="w-full space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading
        title={title}
        description={description}
        className="mb-4 [&_h1]:text-[1.375rem] [&_h1]:leading-8"
      />

      <nav
        aria-label="Accounting navigation"
        className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0 pb-1 shadow-[inset_0_-1px_0_0_var(--edge-neutral-rest)]"
      >
        {accountingTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
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
