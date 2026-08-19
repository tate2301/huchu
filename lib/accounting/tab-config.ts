import {
  type LucideIcon,
  BarChart3,
  Calendar,
  Checklist,
  Dashboard,
  FileCheck,
  ManageAccounts,
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
  | "receivables"
  | "payables"
  | "financial-reports"
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

export type AccountingTabCategory =
  | "hub"
  | "core"
  | "receivables"
  | "payables"
  | "treasury"
  | "controls"
  | "tax-compliance"
  | "reports";

export type AccountingCategory = {
  id: AccountingTabCategory;
  label: string;
  icon: LucideIcon;
  order: number;
};

export type AccountingTabItem = {
  id: AccountingTab;
  label: string;
  href: string;
  icon: LucideIcon;
  featureKey: string;
  categoryId: AccountingTabCategory;
};

export const ACCOUNTING_CATEGORIES: AccountingCategory[] = [
  { id: "hub", label: "Overview", icon: Dashboard, order: 1 },
  { id: "core", label: "Core", icon: Scale, order: 2 },
  { id: "receivables", label: "Receivables", icon: ReceiptLong, order: 3 },
  { id: "payables", label: "Payables", icon: PackageCheck, order: 4 },
  { id: "treasury", label: "Treasury", icon: Wallet, order: 5 },
  { id: "controls", label: "Controls", icon: ManageAccounts, order: 6 },
  { id: "tax-compliance", label: "Tax & Compliance", icon: ShieldCheck, order: 7 },
  { id: "reports", label: "Reports", icon: BarChart3, order: 8 },
];

/**
 * The accounting navigation, after the ST-1.2 trim.
 *
 * Four surfaces are **parked, not deleted**: banking reconciliation, currency
 * rates, cost centers and financial statements. They are gone from here, so
 * nobody navigates to them, while their pages, APIs, models and feature keys
 * stay exactly as they were.
 *
 * The distinction is load-bearing rather than cautious. `accounting.banking`
 * gates the executive dashboard's cash tiles and its cash trend
 * (`app/api/dashboard/executive-overview/route.ts`), and
 * `accounting.financial-statements` gates the general-ledger and cash-flow
 * report APIs as well as the reporting hub — so retiring either *entitlement*
 * would take out surfaces the trim was never meant to touch, including the one
 * ST-1.2's own acceptance signal says must keep rendering. Parking is
 * navigation, not entitlement.
 *
 * Their ids stay in `AccountingTab` because the parked pages still pass them to
 * `AccountingShell`; a tab id with no entry here simply highlights nothing,
 * which is the correct behaviour for a page reachable only by direct URL.
 *
 * Whether the bundles should still *charge* for a parked feature is a pricing
 * question, not a navigation one — it belongs to PR-4 and is recorded there.
 */
export const ACCOUNTING_TABS: AccountingTabItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/accounting",
    icon: Scale,
    featureKey: "accounting.core",
    categoryId: "hub",
  },
  {
    id: "chart-of-accounts",
    label: "Chart of Accounts",
    href: "/accounting/chart-of-accounts",
    icon: TableRows,
    featureKey: "accounting.chart-of-accounts",
    categoryId: "core",
  },
  {
    id: "journals",
    label: "Journals",
    href: "/accounting/journals",
    icon: FileCheck,
    featureKey: "accounting.journals",
    categoryId: "core",
  },
  {
    id: "periods",
    label: "Periods",
    href: "/accounting/periods",
    icon: Calendar,
    featureKey: "accounting.periods",
    categoryId: "core",
  },
  {
    id: "posting-rules",
    label: "Posting Rules",
    href: "/accounting/posting-rules",
    icon: Checklist,
    featureKey: "accounting.posting-rules",
    categoryId: "core",
  },
  {
    id: "receivables",
    label: "Receivables",
    href: "/accounting/receivables",
    icon: ReceiptLong,
    featureKey: "accounting.ar",
    categoryId: "receivables",
  },
  {
    id: "sales",
    label: "Sales",
    href: "/accounting/sales",
    icon: ReceiptLong,
    featureKey: "accounting.ar",
    categoryId: "receivables",
  },
  {
    id: "payables",
    label: "Payables",
    href: "/accounting/payables",
    icon: PackageCheck,
    featureKey: "accounting.ap",
    categoryId: "payables",
  },
  {
    id: "purchases",
    label: "Purchases",
    href: "/accounting/purchases",
    icon: PackageCheck,
    featureKey: "accounting.ap",
    categoryId: "payables",
  },
  // ST-1.2 — banking, currency and cost centers are parked: not in the
  // navigation, models and routes untouched. See the note above
  // ACCOUNTING_TABS.
  {
    id: "tax",
    label: "Tax",
    href: "/accounting/tax",
    icon: ShieldCheck,
    featureKey: "accounting.tax",
    categoryId: "tax-compliance",
  },
  {
    id: "fiscalisation",
    label: "Fiscalisation",
    href: "/accounting/fiscalisation",
    icon: QrCode,
    featureKey: "accounting.zimra.fiscalisation",
    categoryId: "tax-compliance",
  },
  {
    id: "financial-reports",
    label: "Financial Reports",
    href: "/accounting/financial-reports",
    icon: BarChart3,
    featureKey: "accounting.financial-statements",
    categoryId: "reports",
  },
  {
    id: "trial-balance",
    label: "Trial Balance",
    href: "/accounting/trial-balance",
    icon: BarChart3,
    featureKey: "accounting.trial-balance",
    categoryId: "reports",
  },
];

export const ACCOUNTING_OPERATIONS_SECTIONS = {
  overview: ["/accounting"],
  receivables: ["/accounting/receivables", "/accounting/sales"],
  payables: ["/accounting/payables", "/accounting/purchases"],
  reporting: ["/accounting/financial-reports", "/accounting/trial-balance"],
  master: [
    "/accounting/chart-of-accounts",
    "/accounting/periods",
    "/accounting/journals",
    "/accounting/posting-rules",
    "/accounting/tax",
    "/accounting/fiscalisation",
  ],
} as const;
