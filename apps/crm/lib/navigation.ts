import {
  MapPin,
  BarChart3,
  Building2,
  CalendarCheck,
  ChartLine,
  Checklist,
  Dashboard,
  FileText,
  Fuel,
  Funnel,
  History,
  Zap,
  ManageAccounts,
  NoteAdd,
  ReceiptLong,
  TableRows,
  Home,
  Package,
  PackageCheck,
  Scale,
  Upload,
  UserRound,
  Users,
  Payments,
  Phone,
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
  // The CRM is not one thing you open, it is six. A single parent entry meant
  // every route inside it cost two clicks and hid behind a word — "CRM" — that
  // names a category rather than a place. Its groups are root entries now,
  // each expanding to its own children, which is how the reference works and
  // how anybody actually describes where they are going: "the pipeline",
  // "records", "the paperwork".
  //
  // They share `crm.core`, so a tenant without the module loses the whole set
  // rather than being left with six empty headings.
  {
    id: "crm",
    title: "CRM",
    description: "Leads, clients, site visits, and sales pipeline",
    featureKey: "crm.core",
    // Rendered flat: each group below becomes its own root entry in the
    // sidebar rather than a band inside a "CRM" parent. "CRM" names a category,
    // not a place — nobody says "I'm going to CRM", they say "the pipeline" or
    // "the paperwork", and burying six of those behind one word cost a click
    // each and told you nothing on the way past.
    flattenGroups: true,
    groups: [
      // Attio's word, and the right one: these are the kinds of thing the CRM
      // keeps, and somebody looking for People is looking for an object, not
      // for "records" as opposed to "pipeline". Splitting leads and deals away
      // from people and companies drew a line the data does not have.
      { id: "objects", label: "Objects" },
      { id: "work", label: "Work" },
      { id: "documents", label: "Sales documents" },
      { id: "learn", label: "Insights" },
      { id: "workflows", label: "Workflows" },
      { id: "setup", label: "CRM setup" },
    ],
    items: [
      { href: "/crm", icon: Dashboard, label: "CRM overview" },

      { href: "/crm/leads", icon: Funnel, label: "Leads", group: "objects" },
      { href: "/crm/deals", icon: Funnel, label: "Deals", group: "objects" },
      { href: "/crm/forms", icon: NoteAdd, label: "Intake forms", group: "work" },

      { href: "/crm/people", icon: Users, label: "People", group: "objects" },
      { href: "/crm/companies", icon: Building2, label: "Companies", group: "objects" },
      { href: "/crm/sites", icon: MapPin, label: "Sites", group: "objects" },
      { href: "/crm/reps", icon: UserRound, label: "Sales reps", group: "objects" },

      { href: "/crm/tasks", icon: Checklist, label: "Tasks", group: "work" },
      { href: "/crm/appointments", icon: CalendarCheck, label: "Site visits", group: "work" },
      // Service delivery, not paperwork. A job sat under "Sales documents"
      // beside quotes and invoices, which is where you look for something to
      // send a customer — and it is the one entry here that is a crew going
      // somewhere. Labelled "Jobs" because that is what the page, the button
      // and everybody in the building already call it.
      { href: "/crm/work-orders", icon: Wrench, label: "Jobs", group: "work" },
      { href: "/crm/follow-ups", icon: Phone, label: "Follow-ups", group: "work" },

      { href: "/crm/quotes", icon: FileText, label: "Quotes", group: "documents" },
      { href: "/crm/invoices", icon: ReceiptLong, label: "Invoices", group: "documents" },
      { href: "/crm/receipts", icon: Payments, label: "Receipts", group: "documents" },
      { href: "/crm/collections", icon: Scale, label: "Collections", group: "documents" },

      { href: "/crm/insights", icon: BarChart3, label: "Insights", group: "learn" },
      { href: "/crm/reports", icon: ChartLine, label: "Sales reports", group: "learn" },

      {
        href: "/crm/workflows",
        icon: Zap,
        label: "Workflows",
        roles: ["SUPERADMIN", "MANAGER"],
        group: "workflows",
      },
      {
        href: "/crm/workflows/runs",
        icon: History,
        label: "Workflow activity",
        roles: ["SUPERADMIN", "MANAGER"],
        group: "workflows",
      },

      { href: "/crm/import", icon: Upload, label: "Import", group: "setup" },
      {
        href: "/crm/settings",
        icon: ManageAccounts,
        label: "CRM settings",
        roles: ["SUPERADMIN", "MANAGER"],
        group: "setup",
      },
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
