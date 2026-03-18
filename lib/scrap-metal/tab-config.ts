import {
  BarChart3,
  Coins,
  Package,
  Payments,
  ReceiptLong,
  Recycle,
  TableRows,
  Wallet,
  type LucideIcon,
} from "@/lib/icons";

export type ScrapTabId =
  | "overview"
  | "buying-purchases"
  | "buying-pricing"
  | "yard-batches"
  | "trading-sales"
  | "settlements"
  | "reports"
  | "setup-materials";

export type ScrapTabItem = {
  id: ScrapTabId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const SCRAP_TABS: ScrapTabItem[] = [
  { id: "overview", label: "Overview", href: "/scrap-metal", icon: Recycle },
  {
    id: "buying-purchases",
    label: "Purchases",
    href: "/scrap-metal/buying/purchases",
    icon: Payments,
  },
  {
    id: "buying-pricing",
    label: "Price Board",
    href: "/scrap-metal/buying/pricing",
    icon: Coins,
  },
  {
    id: "yard-batches",
    label: "Yard Stock",
    href: "/scrap-metal/yard/batches",
    icon: Package,
  },
  {
    id: "trading-sales",
    label: "Bulk Sales",
    href: "/scrap-metal/trading/sales",
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
  {
    id: "setup-materials",
    label: "Materials",
    href: "/scrap-metal/setup/materials",
    icon: TableRows,
  },
];

export const SCRAP_OPERATIONS_SECTIONS = {
  buying: ["/scrap-metal", "/scrap-metal/buying/purchases", "/scrap-metal/buying/pricing"],
  yard: ["/scrap-metal/yard/batches"],
  trading: ["/scrap-metal/trading/sales"],
  settlements: ["/scrap-metal/settlements"],
  reporting: ["/scrap-metal/reports"],
  setup: ["/scrap-metal/setup/materials"],
} as const;
