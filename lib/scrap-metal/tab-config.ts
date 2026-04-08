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
  | "ticketing"
  | "purchases"
  | "approval-requests"
  | "held-tickets"
  | "yard-stock"
  | "adjustments"
  | "unassigned-purchases"
  | "sales"
  | "settlements"
  | "reports"
  | "daily-snapshot"
  | "supplier-performance"
  | "variance-aging"
  | "ticket-templates";

export type ScrapTabItem = {
  id: ScrapTabId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const SCRAP_TABS: ScrapTabItem[] = [
  { id: "overview", label: "Overview", href: "/scrap-metal", icon: Recycle },
  { id: "ticketing", label: "Ticketing", href: "/scrap-metal/tickets", icon: ReceiptLong },
  {
    id: "purchases",
    label: "Inbound Tickets",
    href: "/scrap-metal/purchases",
    icon: Payments,
  },
  {
    id: "approval-requests",
    label: "Approval Requests",
    href: "/scrap-metal/sales/approval-requests",
    icon: ReceiptLong,
  },
  {
    id: "held-tickets",
    label: "Held / Draft",
    href: "/scrap-metal/tickets/held",
    icon: Wallet,
  },
  {
    id: "yard-stock",
    label: "Lots",
    href: "/scrap-metal/batches",
    icon: Package,
  },
  {
    id: "adjustments",
    label: "Adjustments / Write-offs",
    href: "/scrap-metal/adjustments",
    icon: Wallet,
  },
  {
    id: "unassigned-purchases",
    label: "Unassigned Purchases",
    href: "/scrap-metal/purchases/unassigned",
    icon: Package,
  },
  {
    id: "sales",
    label: "Outbound Tickets",
    href: "/scrap-metal/sales",
    icon: ReceiptLong,
  },
  {
    id: "settlements",
    label: "Staff Settlements",
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
    id: "daily-snapshot",
    label: "Daily Snapshot",
    href: "/scrap-metal/reports/daily-snapshot",
    icon: BarChart3,
  },
  {
    id: "supplier-performance",
    label: "Supplier Performance",
    href: "/scrap-metal/reports/supplier-performance",
    icon: BarChart3,
  },
  {
    id: "variance-aging",
    label: "Variance & Aging",
    href: "/scrap-metal/reports/variance-aging",
    icon: BarChart3,
  },
  {
    id: "ticket-templates",
    label: "Ticket Templates",
    href: "/scrap-metal/ticket-templates",
    icon: ReceiptLong,
  },
];

export const SCRAP_OPERATIONS_SECTIONS = {
  ticketing: [
    "/scrap-metal/tickets",
    "/scrap-metal/purchases",
    "/scrap-metal/sales",
    "/scrap-metal/sales/approval-requests",
    "/scrap-metal/tickets/held",
  ],
  lots: ["/scrap-metal/batches", "/scrap-metal/purchases/unassigned", "/scrap-metal/adjustments"],
  cash: ["/scrap-metal/settlements"],
  reporting: [
    "/scrap-metal/reports",
    "/scrap-metal/reports/daily-snapshot",
    "/scrap-metal/reports/supplier-performance",
    "/scrap-metal/reports/variance-aging",
  ],
  setup: [
    "/management/master-data/operations/scrap-materials",
    "/management/master-data/operations/scrap-sellers",
    "/scrap-metal/pricing",
    "/scrap-metal/ticket-templates",
  ],
} as const;
