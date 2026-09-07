import {
  MapPin,
  ArrowDownward,
  BarChart3,
  Building2,
  Calendar,
  Checklist,
  ClipboardList,
  Coins,
  Dashboard,
  FileText,
  Fuel,
  History,
  LocalShipping,
  ReceiptLong,
  ReportProblem,
  TableRows,
  Home,
  Package,
  PackageCheck,
  ShieldCheck,
  Scale,
  UserRound,
  Users,
  Wallet,
  Wrench,
} from "@corelithzw/ui/lib/icons";
import { PEOPLE_TABS } from "@corelithzw/module-people/people/tab-config";
import { PAYROLL_TABS } from "@corelithzw/module-people/payroll/tab-config";
import { hasRole, type UserRole } from "@corelithzw/platform/roles";

// Who may reach People and Payroll at all; the proxy checks it on the prefix
// from the people module's manifest.
const WORKFORCE_MODULE_ALLOWED_ROLES: UserRole[] = ["SUPERADMIN", "MANAGER", "CLERK"];

import type { NavGroup, NavItem, NavSection } from "@corelithzw/shell/navigation";

export type { NavGroup, NavItem, NavSection };

export const navSections: NavSection[] = [
  {
    id: "overview",
    title: "Start",
    items: [
      { href: "/", icon: Home, label: "Home" },
      { href: "/help", icon: FileText, label: "Quick Tips" },
    ],
  },
  {
    id: "reporting",
    title: "Reports",
    description: "Open report pages across operations",
    featureKey: "reports.dashboard",
    items: [
      { href: "/reports/attendance", icon: Checklist, label: "Attendance" },
      {
        href: "/reports/stores-movements",
        icon: History,
        label: "Stock Movements",
      },
      { href: "/reports/fuel-ledger", icon: Fuel, label: "Fuel Ledger" },
      {
        href: "/reports/maintenance-work-orders",
        icon: Wrench,
        label: "Work Orders",
      },
      {
        href: "/reports/maintenance-equipment",
        icon: Package,
        label: "Equipment Service",
      },
      {
        href: "/reports/compliance-incidents",
        icon: ShieldCheck,
        label: "Incidents",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "people",
    title: "People",
    description: "Employee records, rosters and workforce history",
    featureKey: "hr.employees",
    items: PEOPLE_TABS.map((tab) => ({
      href: tab.href,
      icon: tab.icon,
      label: tab.label,
      roles: WORKFORCE_MODULE_ALLOWED_ROLES,
    })),
  },
  {
    id: "payroll",
    title: "Payroll",
    description: "Compensation, month-end runs and statutory returns",
    featureKey: "hr.payroll",
    items: PAYROLL_TABS.map((tab) => ({
      href: tab.href,
      icon: tab.icon,
      label: tab.label,
      // Compensation rules set what everybody is paid, so they stay with the
      // people who can approve a run rather than the clerk who prepares one.
      roles:
        tab.categoryId === "compensation"
          ? ["SUPERADMIN", "MANAGER"]
          : WORKFORCE_MODULE_ALLOWED_ROLES,
    })),
  },
  {
    id: "maintenance",
    title: "Maintenance & Assets",
    description: "Equipment, work orders, scheduling",
    featureKey: "maintenance.dashboard",
    items: [
      { href: "/maintenance", icon: Dashboard, label: "Overview" },
      {
        href: "/maintenance/equipment",
        icon: Wrench,
        label: "Equipment Register",
      },
      {
        href: "/maintenance/work-orders",
        icon: Checklist,
        label: "Work Orders",
      },
      {
        href: "/maintenance/breakdown",
        icon: ReportProblem,
        label: "Log Breakdown",
      },
      { href: "/maintenance/schedule", icon: Calendar, label: "PM Schedule" },
    ],
  },
  {
    id: "stores",
    title: "Stores & Inventory",
    description: "Inventory and fuel control",
    featureKey: "stores.dashboard",
    // Issuing and receiving left this list when they became dialogs — a write
    // action does not belong in a column of places to look.
    groups: [
      { id: "stock", label: "Stock" },
      { id: "selling", label: "What we sell" },
    ],
    items: [
      { href: "/stores/dashboard", icon: Dashboard, label: "Overview" },

      { href: "/stores/inventory", icon: Package, label: "Stock on hand", group: "stock" },
      { href: "/stores/locations", icon: MapPin, label: "Locations", group: "stock" },
      { href: "/stores/movements", icon: History, label: "Movements", group: "stock" },
      { href: "/stores/fuel", icon: Fuel, label: "Fuel log", group: "stock" },

      { href: "/stores/catalogue", icon: TableRows, label: "Catalogue", group: "selling" },
      { href: "/stores/price-lists", icon: Scale, label: "Price lists", group: "selling" },
    ],
  },
  // ONE sidebar, not two.
  //
  // `flattenGroups` makes every group below a root-level entry that opens on
  // its own, so the campus nav *is* the sidebar rather than a second rail
  // hanging off a "School Operations" link. That only works if almost nothing
  // is left ungrouped: eleven loose items used to render as a flat wall of
  // links beside the groups, which is what made it read as two navigations.
  // Overview is the single exception, because an overview is a destination and
  // not a category to expand.
  //
  // The bands are the jobs people come here to do, in the order a school day
  // touches them — who is on the roll, who is in tonight, what is being taught,
  // what was marked, what is owed, what is lent, what has been said, what gets
  // printed. A registrar, a bursar, a boarding master and an examinations
  // officer each own one band and can ignore the rest.
  //
  // Classroom work is deliberately absent. Lesson plans, teaching resources,
  // the scheme of work and mark capture live in the teacher portal, because a
  // teacher does them and an administrator does not. The office keeps
  // oversight — who has not marked, moderation, publishing — which is a
  // different question asked of the same tables.
  //
  // The academic ladder is absent for a different reason: years, terms,
  // classes, subjects, periods and grading are master data and live under
  // Management. Two entries reach across to them — "Identity and records" and
  // "Academic setup" — so nobody has to know they moved.
  //
  // Every group shares `schools.core`, so a tenant without the module loses the
  // whole set rather than being left with empty headings.
  {
    id: "retail",
    title: "Retail",
    description: "Overview, sales, range and stock, purchasing, customers, shifts, reports, and setup",
    featureKey: "retail.core",
    // The only definition of retail's nav items, and every href is a route that
    // exists. It used to be a second list of alias paths (`/retail/sell`,
    // `/retail/buy`, …) whose sole purpose was to carry a feature key for
    // `lib/workspaces.ts` to probe, which meant every surface was gated on
    // `retail.core` here while the page itself enforced a tighter key. The
    // real paths carry their own keys in the route registry, so gating and
    // enforcement now agree.
    items: [
      { href: "/retail", icon: Wallet, label: "Overview" },
      { href: "/retail/sales", icon: ClipboardList, label: "Sales" },
      { href: "/retail/shifts", icon: ReceiptLong, label: "Shifts" },
      { href: "/retail/customers", icon: Users, label: "Customers" },
      { href: "/retail/catalog", icon: TableRows, label: "Catalog" },
      { href: "/retail/merchandising/pricing", icon: Coins, label: "Pricing" },
      { href: "/retail/merchandising/promotions", icon: ReceiptLong, label: "Promotions" },
      { href: "/retail/stock", icon: Package, label: "Stock Overview" },
      { href: "/retail/stock/count", icon: ClipboardList, label: "Stock Count" },
      { href: "/retail/stock/transfers", icon: ArrowDownward, label: "Transfers" },
      { href: "/retail/purchasing/orders", icon: Package, label: "Purchase Orders" },
      { href: "/retail/purchasing/receipts", icon: LocalShipping, label: "Goods Receipts" },
      { href: "/retail/reports", icon: BarChart3, label: "Reports" },
      { href: "/retail/setup", icon: Building2, label: "Setup Overview" },
      { href: "/retail/setup/operations", icon: Building2, label: "Operations" },
      { href: "/retail/setup/branding", icon: Building2, label: "Branding" },
      { href: "/retail/setup/pos-policy", icon: Scale, label: "POS Policy" },
      { href: "/retail/setup/accounting", icon: Scale, label: "Accounting Setup" },
    ],
  },
  {
    // Retail's customer ledger, not the CRM module. It used to share the id
    // "crm" with it, and since section lookups are built from this array the
    // later entry silently won.
    id: "retail-customers",
    title: "Customers",
    description: "Customer profiles, loyalty, and ledgers",
    featureKey: "crm.customers",
    items: [
      { href: "/retail/customers", icon: Users, label: "Customers" },
    ],
  },
  {
    id: "accounting",
    title: "Accounting",
    description: "Ledger, journals, and finance controls",
    featureKey: "accounting.core",
    items: [
      { href: "/accounting", icon: Scale, label: "Accounting Overview" },
      { href: "/accounting/receivables", icon: ReceiptLong, label: "Receivables" },
      { href: "/accounting/payables", icon: PackageCheck, label: "Payables" },
      { href: "/accounting/financial-reports", icon: BarChart3, label: "Financial Reports" },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    description: "Organisation settings and administration",
    items: [
      {
        href: "/compliance",
        icon: ShieldCheck,
        label: "Compliance",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/preferences/organization/users",
        icon: UserRound,
        label: "Users",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/management/master-data",
        icon: TableRows,
        label: "Master Data",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/preferences/organization/branding/identity",
        icon: Building2,
        label: "Branding",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "templates",
    title: "Templates",
    description: "Every form, quote layout and document the company sends",
    items: [
      {
        href: "/templates",
        icon: FileText,
        label: "Templates",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
];

export function getNavSectionsForRole(role: string | null | undefined) {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.roles ? hasRole(role, item.roles) : true,
      ),
    }))
    .filter((section) => section.items.length > 0);
}
