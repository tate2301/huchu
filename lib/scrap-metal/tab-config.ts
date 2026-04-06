import {
  BarChart3,
  Package,
  Payments,
  ReceiptLong,
  Recycle,
  Wallet,
  type LucideIcon,
} from "@/lib/icons";

export type ScrapTabId =
  | "overview"
  | "purchases"
  | "yard-stock"
  | "sales"
  | "settlements"
  | "reports";

export type ScrapTabItem = {
  id: ScrapTabId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const SCRAP_TABS: ScrapTabItem[] = [
  { id: "overview", label: "Overview", href: "/scrap-metal", icon: Recycle },
  {
    id: "purchases",
    label: "Purchases",
    href: "/scrap-metal/purchases",
    icon: Payments,
  },
  {
    id: "yard-stock",
    label: "Yard Stock",
    href: "/scrap-metal/batches",
    icon: Package,
  },
  {
    id: "sales",
    label: "Bulk Sales",
    href: "/scrap-metal/sales",
    icon: ReceiptLong,
  },
  {
    id: "settlements",
    label: "Settlements",
    href: "/scrap-metal/settlements",
    icon: Wallet,
  },
  {
    id: "reports",
    label: "Reports",
    href: "/scrap-metal/reports",
    icon: BarChart3,
  },
];

export const SCRAP_OPERATIONS_SECTIONS = {
  overview: ["/scrap-metal"],
  purchases: ["/scrap-metal/purchases"],
  yard: ["/scrap-metal/batches"],
  trading: ["/scrap-metal/sales"],
  settlements: ["/scrap-metal/settlements"],
  reporting: ["/scrap-metal/reports"],
  management: ["/scrap-metal/pricing"],
} as const;
