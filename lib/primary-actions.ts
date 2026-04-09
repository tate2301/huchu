import type { NavItem } from "@/lib/navigation";
import { hasRole } from "@/lib/roles";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import {
  BarChart3,
  ArrowDownward,
  Building2,
  Calendar,
  ClipboardList,
  Coins,
  Dataset,
  Factory,
  LocalShipping,
  Package,
  Payments,
  ReceiptLong,
  Users,
  Wallet,
} from "@/lib/icons";

type PrimaryActionsArgs = {
  workspaceProfile: string | null | undefined;
  role: string | null | undefined;
  enabledFeatures: string[] | undefined;
};

type WorkspaceProfileKey =
  | "GOLD_MINE"
  | "SCRAP_METAL"
  | "SCHOOLS"
  | "AUTOS"
  | "RETAIL"
  | "GENERAL";

function normalizeWorkspaceProfile(value: string | null | undefined): WorkspaceProfileKey {
  const normalized = String(value || "").trim().toUpperCase();
  switch (normalized) {
    case "SCRAP_METAL":
    case "SCHOOLS":
    case "AUTOS":
    case "RETAIL":
    case "THRIFT":
    case "GENERAL":
    case "GOLD_MINE":
      return normalized === "THRIFT" ? "RETAIL" : normalized;
    default:
      return "GOLD_MINE";
  }
}

const GENERAL_PRIMARY_ACTIONS: NavItem[] = [
  { href: "/shift-report", icon: Dataset, label: "Shift Report" },
  { href: "/attendance", icon: Calendar, label: "Attendance" },
  { href: "/plant-report", icon: Factory, label: "Plant Report" },
  { href: "/stores/receive", icon: LocalShipping, label: "Receive Stock" },
  { href: "/stores/issue", icon: Package, label: "Issue Stock" },
  { href: "/gold/intake/pours/new", icon: Coins, label: "Log Gold Output" },
  { href: "/gold/intake/purchases/new", icon: Payments, label: "Record Purchase" },
];

const PROFILE_PRIMARY_ACTIONS: Record<Exclude<WorkspaceProfileKey, "GENERAL">, NavItem[]> = {
  GOLD_MINE: [
    { href: "/shift-report", icon: Dataset, label: "Shift Report" },
    { href: "/attendance", icon: Calendar, label: "Attendance" },
    { href: "/plant-report", icon: Factory, label: "Plant Report" },
    { href: "/gold/intake/pours/new", icon: Coins, label: "Log Gold Output" },
    { href: "/gold/intake/purchases/new", icon: Payments, label: "Record Purchase" },
    { href: "/gold/transit/dispatches/new", icon: LocalShipping, label: "Record Dispatch" },
    { href: "/gold/settlement/receipts/new", icon: ReceiptLong, label: "Record Receipt" },
  ],
  SCRAP_METAL: [
    { href: "/scrap-metal/tickets", icon: Payments, label: "New Inbound Ticket" },
    { href: "/scrap-metal/batches", icon: Package, label: "Open Lot", roles: ["SUPERADMIN", "MANAGER"] },
    { href: "/scrap-metal/sales", icon: ReceiptLong, label: "New Outbound Ticket", roles: ["SUPERADMIN", "MANAGER"] },
    { href: "/scrap-metal/tickets/held", icon: Wallet, label: "Held Tickets" },
    { href: "/stores/receive", icon: ArrowDownward, label: "Receive Stock" },
  ],
  SCHOOLS: [
    { href: "/schools/admissions", icon: Building2, label: "Admissions" },
    { href: "/schools/attendance", icon: Calendar, label: "Attendance" },
    { href: "/schools/finance", icon: ReceiptLong, label: "Finance" },
  ],
  AUTOS: [
    { href: "/car-sales/leads", icon: Users, label: "Leads" },
    { href: "/car-sales/inventory", icon: Package, label: "Inventory" },
    { href: "/car-sales/deals", icon: Wallet, label: "Deals" },
  ],
  RETAIL: [
    { href: "/portal/pos", icon: Payments, label: "Open POS" },
    { href: "/retail/sales", icon: ClipboardList, label: "Sales" },
    { href: "/retail/stock", icon: Package, label: "Stock" },
    { href: "/retail/purchasing/orders", icon: Package, label: "Purchase Orders" },
    { href: "/retail/purchasing/receipts", icon: LocalShipping, label: "Receive Stock" },
    { href: "/retail/customers", icon: Users, label: "Customers" },
    { href: "/retail/shifts", icon: ReceiptLong, label: "Cash Control" },
    { href: "/retail/reports", icon: BarChart3, label: "Insights" },
    { href: "/retail/setup", icon: Building2, label: "Setup" },
  ],
};

export function getPrimaryQuickActions({
  workspaceProfile,
  role,
  enabledFeatures,
}: PrimaryActionsArgs): NavItem[] {
  const profile = normalizeWorkspaceProfile(workspaceProfile);
  const actions =
    profile === "GENERAL"
      ? GENERAL_PRIMARY_ACTIONS
      : PROFILE_PRIMARY_ACTIONS[profile];

  return filterHrefItemsByEnabledFeatures(
    actions.filter((item) => (item.roles ? hasRole(role, item.roles) : true)),
    enabledFeatures,
  );
}
