import {
  BarChart3,
  Building2,
  ClipboardList,
  LocalShipping,
  Package,
  ReceiptLong,
  Scale,
  TableRows,
  Users,
  Wallet,
  type LucideIcon,
} from "@/lib/icons";

export type RetailTabId =
  | "overview"
  | "sell"
  | "merchandise"
  | "stock"
  | "buy"
  | "customers"
  | "cash-control"
  | "accounting"
  | "insights"
  | "setup";

export type RetailTabItem = {
  id: RetailTabId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const RETAIL_TABS: RetailTabItem[] = [
  { id: "overview", label: "Overview", href: "/retail", icon: Wallet },
  { id: "sell", label: "Sell", href: "/retail/sell", icon: ClipboardList },
  { id: "merchandise", label: "Merchandise", href: "/retail/merchandise", icon: TableRows },
  { id: "stock", label: "Stock", href: "/retail/stock", icon: Package },
  { id: "buy", label: "Buy", href: "/retail/buy", icon: LocalShipping },
  { id: "customers", label: "Customers", href: "/retail/customers", icon: Users },
  { id: "cash-control", label: "Cash Control", href: "/retail/cash-control", icon: ReceiptLong },
  { id: "accounting", label: "Accounting", href: "/retail/accounting", icon: Scale },
  { id: "insights", label: "Insights", href: "/retail/insights", icon: BarChart3 },
  { id: "setup", label: "Setup", href: "/retail/setup", icon: Building2 },
];

export const RETAIL_OPERATIONS_SECTIONS = {
  overview: ["/retail"],
  sell: ["/retail/sell"],
  merchandise: ["/retail/merchandise"],
  stock: ["/retail/stock"],
  buy: ["/retail/buy"],
  customers: ["/retail/customers"],
  "cash-control": ["/retail/cash-control", "/retail/shifts"],
  accounting: ["/retail/accounting", "/accounting"],
  insights: ["/retail/insights"],
  setup: ["/retail/setup"],
} as const;
