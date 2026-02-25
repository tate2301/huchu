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

export type AccountingTabItem = {
  id: AccountingTab;
  label: string;
  href: string;
  icon: LucideIcon;
  featureKey: string;
};

export const ACCOUNTING_TABS: AccountingTabItem[] = [
  { id: "overview", label: "Overview", href: "/accounting", icon: Scale, featureKey: "accounting.core" },
  {
    id: "chart-of-accounts",
    label: "Chart of Accounts",
    href: "/accounting/chart-of-accounts",
    icon: TableRows,
    featureKey: "accounting.chart-of-accounts",
  },
  { id: "journals", label: "Journals", href: "/accounting/journals", icon: FileCheck, featureKey: "accounting.journals" },
  { id: "periods", label: "Periods", href: "/accounting/periods", icon: Calendar, featureKey: "accounting.periods" },
  {
    id: "trial-balance",
    label: "Trial Balance",
    href: "/accounting/trial-balance",
    icon: BarChart3,
    featureKey: "accounting.trial-balance",
  },
  {
    id: "financials",
    label: "Financials",
    href: "/accounting/financial-statements",
    icon: BarChart3,
    featureKey: "accounting.financial-statements",
  },
  {
    id: "posting-rules",
    label: "Posting Rules",
    href: "/accounting/posting-rules",
    icon: Checklist,
    featureKey: "accounting.posting-rules",
  },
  { id: "sales", label: "Sales", href: "/accounting/sales", icon: ReceiptLong, featureKey: "accounting.ar" },
  {
    id: "purchases",
    label: "Purchases",
    href: "/accounting/purchases",
    icon: PackageCheck,
    featureKey: "accounting.ap",
  },
  { id: "banking", label: "Banking", href: "/accounting/banking", icon: Wallet, featureKey: "accounting.banking" },
  { id: "assets", label: "Assets", href: "/accounting/assets", icon: Package, featureKey: "accounting.fixed-assets" },
  { id: "budgets", label: "Budgets", href: "/accounting/budgets", icon: BarChart3, featureKey: "accounting.budgets" },
  {
    id: "cost-centers",
    label: "Cost Centers",
    href: "/accounting/cost-centers",
    icon: ManageAccounts,
    featureKey: "accounting.cost-centers",
  },
  {
    id: "currency",
    label: "Currency",
    href: "/accounting/currency",
    icon: ArrowRightLeft,
    featureKey: "accounting.multi-currency",
  },
  { id: "tax", label: "Tax", href: "/accounting/tax", icon: ShieldCheck, featureKey: "accounting.tax" },
  {
    id: "fiscalisation",
    label: "Fiscalisation",
    href: "/accounting/fiscalisation",
    icon: QrCode,
    featureKey: "accounting.zimra.fiscalisation",
  },
];
