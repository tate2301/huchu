import type { NavItem } from "@/lib/navigation";
import { hasRole } from "@corelithzw/platform/roles";
import { filterHrefItemsByEnabledFeatures } from "@corelithzw/platform/gating/nav-filter";
import {
  resolveWorkspaceVerticalProductBundle,
  type VerticalProductId,
} from "@corelithzw/platform/workspace-products";
import {
  BarChart3,
  ArrowDownward,
  ArrowUpward,
  Building2,
  Calendar,
  ClipboardList,
  Coins,
  Dataset,
  Factory,
  Funnel,
  LocalShipping,
  Package,
  Payments,
  ReceiptLong,
  ReportProblem,
  Users,
  Wrench,
} from "@corelithzw/ui/lib/icons";

type PrimaryActionsArgs = {
  workspaceProfile: string | null | undefined;
  role: string | null | undefined;
  enabledFeatures: string[] | undefined;
};

// Quick-create actions are keyed by the resolved vertical product so every
// workspace only ever offers actions native to its own modules. Items are
// additionally filtered by role and by the tenant's enabled features (via the
// route registry), so an action never renders for a feature the tenant lacks.
const PRODUCT_PRIMARY_ACTIONS: Record<VerticalProductId, NavItem[]> = {
  "gold-operations": [
    { href: "/shift-report", icon: Dataset, label: "Shift Report" },
    { href: "/people/attendance", icon: Calendar, label: "Attendance" },
    { href: "/plant-report", icon: Factory, label: "Plant Report" },
    { href: "/gold/intake/pours/new", icon: Coins, label: "Log Gold Output" },
    { href: "/gold/intake/purchases/new", icon: Payments, label: "Record Purchase" },
    { href: "/gold/transit/dispatches/new", icon: LocalShipping, label: "Record Dispatch" },
    { href: "/gold/settlement/receipts/new", icon: ReceiptLong, label: "Record Receipt" },
  ],
  "school-operations": [
    { href: "/schools/admissions", icon: Building2, label: "Admissions" },
    { href: "/schools/attendance", icon: Calendar, label: "Attendance" },
    { href: "/schools/finance", icon: ReceiptLong, label: "Finance" },
  ],
  "retail-operations": [
    { href: "/portal/pos", icon: Payments, label: "Open POS", roles: ["CASHIER"] },
    { href: "/retail/sales", icon: ClipboardList, label: "Sales" },
    { href: "/retail/stock", icon: Package, label: "Stock" },
    { href: "/retail/purchasing/orders", icon: Package, label: "Purchase Orders" },
    { href: "/retail/purchasing/receipts", icon: LocalShipping, label: "Receive Stock" },
    { href: "/retail/customers", icon: Users, label: "Customers" },
    {
      href: "/retail/shifts",
      icon: ReceiptLong,
      label: "Cash Control",
      roles: ["SUPERADMIN", "MANAGER", "SHOP_MANAGER"],
    },
    { href: "/retail/reports", icon: BarChart3, label: "Insights" },
    { href: "/retail/setup", icon: Building2, label: "Setup" },
  ],
  "crm-sales": [
    { href: "/crm/leads", icon: Funnel, label: "New Lead" },
    { href: "/crm/clients", icon: Users, label: "New Client" },
    { href: "/crm/appointments", icon: Calendar, label: "Book Site Visit" },
    { href: "/crm/follow-ups", icon: ClipboardList, label: "Follow-ups" },
    { href: "/crm/insights", icon: BarChart3, label: "Insights" },
  ],
  "service-workshop": [
    { href: "/maintenance/breakdown", icon: ReportProblem, label: "Log Breakdown" },
    { href: "/maintenance/work-orders", icon: Wrench, label: "Work Orders" },
    { href: "/stores/receive", icon: ArrowDownward, label: "Receive Stock" },
    { href: "/stores/issue", icon: ArrowUpward, label: "Issue Stock" },
    { href: "/people", icon: Users, label: "Employees" },
  ],
  // The four things a payroll bureau actually starts from. Nothing about stock,
  // customers or reports, because none of those modules are provisioned.
  "payroll-services": [
    { href: "/people", icon: Users, label: "Employees" },
    { href: "/payroll/runs", icon: Coins, label: "Payroll Run" },
    { href: "/payroll/statutory/returns", icon: ReceiptLong, label: "Statutory Returns" },
    { href: "/payroll/disbursements", icon: Payments, label: "Disbursements" },
  ],
  "general-business": [
    { href: "/stores/receive", icon: ArrowDownward, label: "Receive Stock" },
    { href: "/stores/issue", icon: ArrowUpward, label: "Issue Stock" },
    { href: "/stores/inventory", icon: Package, label: "Stock on Hand" },
    { href: "/retail/customers", icon: Users, label: "Customers" },
    { href: "/people", icon: Users, label: "Employees" },
    { href: "/reports", icon: BarChart3, label: "Reports" },
  ],
};

export function getPrimaryQuickActions({
  workspaceProfile,
  role,
  enabledFeatures,
}: PrimaryActionsArgs): NavItem[] {
  const verticalProduct = resolveWorkspaceVerticalProductBundle({
    workspaceProfile,
    enabledFeatures,
  });
  const actions = PRODUCT_PRIMARY_ACTIONS[verticalProduct.id] ?? [];

  return filterHrefItemsByEnabledFeatures(
    actions.filter((item) => (item.roles ? hasRole(role, item.roles) : true)),
    enabledFeatures,
  );
}
