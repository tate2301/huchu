import {
  BarChart3,
  ClipboardList,
  Package,
  Payments,
  ReceiptLong,
  TableRows,
  Wallet,
  type LucideIcon,
} from "@/lib/icons";

export type RetailTabId =
  | "overview"
  | "pos"
  | "sales"
  | "catalog"
  | "purchasing-orders"
  | "merchandising-pricing"
  | "merchandising-promotions"
  | "shifts"
  | "reports";

export type RetailTabItem = {
  id: RetailTabId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const RETAIL_TABS: RetailTabItem[] = [
  { id: "overview", label: "Overview", href: "/retail", icon: Wallet },
  { id: "pos", label: "Point of Sale", href: "/portal/pos", icon: Payments },
  { id: "sales", label: "Sales", href: "/retail/sales", icon: ClipboardList },
  { id: "catalog", label: "Catalog", href: "/retail/catalog", icon: Package },
  {
    id: "purchasing-orders",
    label: "Purchasing",
    href: "/retail/purchasing/orders",
    icon: ReceiptLong,
  },
  {
    id: "merchandising-pricing",
    label: "Pricing",
    href: "/retail/merchandising/pricing",
    icon: TableRows,
  },
  {
    id: "merchandising-promotions",
    label: "Promotions",
    href: "/retail/merchandising/promotions",
    icon: ReceiptLong,
  },
  { id: "shifts", label: "Shifts & Cash-up", href: "/retail/shifts", icon: ReceiptLong },
  { id: "reports", label: "Reports", href: "/retail/reports", icon: BarChart3 },
];

export const RETAIL_OPERATIONS_SECTIONS = {
  overview: ["/retail"],
  pos: ["/portal/pos"],
  sales: ["/retail/sales"],
  catalog: ["/retail/catalog"],
  purchasing: ["/retail/purchasing/orders", "/retail/purchasing/receipts"],
  merchandising: ["/retail/merchandising/pricing", "/retail/merchandising/promotions"],
  shifts: ["/retail/shifts"],
  reporting: ["/retail/reports"],
} as const;
