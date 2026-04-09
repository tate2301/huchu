import {
  BarChart3,
  Package,
  Payments,
  ReceiptLong,
  Recycle,
  Wallet,
  type LucideIcon,
} from "@/lib/icons";
import type { UserRole } from "@/lib/roles";

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
  | "ticket-templates"
  | "compliance-rules";

export type ScrapTabItem = {
  id: ScrapTabId;
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: UserRole[];
};

export const SCRAP_TABS: ScrapTabItem[] = [
  {
    id: "overview",
    label: "Home",
    href: "/scrap-metal",
    icon: Recycle,
    roles: ["SUPERADMIN", "MANAGER", "OPERATOR"],
  },
  {
    id: "ticketing",
    label: "Ticketing",
    href: "/scrap-metal/tickets",
    icon: ReceiptLong,
    roles: ["SUPERADMIN", "MANAGER", "OPERATOR"],
  },
  {
    id: "purchases",
    label: "Inbound Tickets",
    href: "/scrap-metal/purchases",
    icon: Payments,
    roles: ["SUPERADMIN", "MANAGER", "OPERATOR"],
  },
  {
    id: "approval-requests",
    label: "Approval Requests",
    href: "/scrap-metal/sales/approval-requests",
    icon: ReceiptLong,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    id: "held-tickets",
    label: "Held / Draft",
    href: "/scrap-metal/tickets/held",
    icon: Wallet,
    roles: ["SUPERADMIN", "MANAGER", "OPERATOR"],
  },
  {
    id: "yard-stock",
    label: "Lots",
    href: "/scrap-metal/batches",
    icon: Package,
    roles: ["SUPERADMIN", "MANAGER", "OPERATOR"],
  },
  {
    id: "adjustments",
    label: "Adjustments / Write-offs",
    href: "/scrap-metal/adjustments",
    icon: Wallet,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    id: "unassigned-purchases",
    label: "Unassigned Purchases",
    href: "/scrap-metal/purchases/unassigned",
    icon: Package,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    id: "sales",
    label: "Outbound Tickets",
    href: "/scrap-metal/sales",
    icon: ReceiptLong,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    id: "settlements",
    label: "Staff Settlements",
    href: "/scrap-metal/settlements",
    icon: Wallet,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    id: "reports",
    label: "Reports",
    href: "/scrap-metal/reports",
    icon: BarChart3,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    id: "daily-snapshot",
    label: "Daily Snapshot",
    href: "/scrap-metal/reports/daily-snapshot",
    icon: BarChart3,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    id: "supplier-performance",
    label: "Supplier Performance",
    href: "/scrap-metal/reports/supplier-performance",
    icon: BarChart3,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    id: "variance-aging",
    label: "Variance & Aging",
    href: "/scrap-metal/reports/variance-aging",
    icon: BarChart3,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    id: "ticket-templates",
    label: "Ticket Templates",
    href: "/scrap-metal/ticket-templates",
    icon: ReceiptLong,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    id: "compliance-rules",
    label: "Compliance Rules",
    href: "/scrap-metal/compliance-rules",
    icon: ReceiptLong,
    roles: ["SUPERADMIN", "MANAGER"],
  },
];

export const SCRAP_OPERATIONS_SECTIONS = {
  ticketing: [
    "/scrap-metal",
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
    "/scrap-metal/compliance-rules",
  ],
} as const;
