import {
  type LucideIcon,
  ArrowRightLeft,
  BarChart3,
  Calendar,
  Checklist,
  Dashboard,
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
  {
    id: "banking",
    label: "Banking",
    href: "/accounting/banking",
    icon: Wallet,
    featureKey: "accounting.banking",
    categoryId: "treasury",
  },
  {
    id: "currency",
    label: "Currency",
    href: "/accounting/currency",
    icon: ArrowRightLeft,
    featureKey: "accounting.multi-currency",
    categoryId: "treasury",
  },
  {
    id: "assets",
    label: "Assets",
    href: "/accounting/assets",
    icon: Package,
    featureKey: "accounting.fixed-assets",
    categoryId: "controls",
  },
  {
    id: "budgets",
    label: "Budgets",
    href: "/accounting/budgets",
    icon: BarChart3,
    featureKey: "accounting.budgets",
    categoryId: "controls",
  },
  {
    id: "cost-centers",
    label: "Cost Centers",
    href: "/accounting/cost-centers",
    icon: ManageAccounts,
    featureKey: "accounting.cost-centers",
    categoryId: "controls",
  },
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
  {
    id: "financials",
    label: "Financial Statements",
    href: "/accounting/financial-statements",
    icon: BarChart3,
    featureKey: "accounting.financial-statements",
    categoryId: "reports",
  },
];
