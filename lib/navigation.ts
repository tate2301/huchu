import {
  MapPin,
  ArrowDownward,
  BarChart3,
  Building2,
  CalendarCheck,
  Calendar,
  ChartLine,
  Checklist,
  ClipboardList,
  Coins,
  Dashboard,
  Dataset,
  EventNote,
  Factory,
  FileCheck,
  FileText,
  Fuel,
  Funnel,
  History,
  Layers,
  Zap,
  LocalShipping,
  ManageAccounts,
  NoteAdd,
  ReceiptLong,
  ReportProblem,
  TableRows,
  TrendingUp,
  Home,
  Package,
  PackageCheck,
  ShieldCheck,
  Scale,
  Upload,
  UserRound,
  Users,
  UserCheck,
  Wallet,
  Payments,
  Phone,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";
import { PEOPLE_TABS } from "@/lib/people/tab-config";
import { PAYROLL_TABS } from "@/lib/payroll/tab-config";
import { hasRole, type UserRole } from "@/lib/roles";

// Who may reach People and Payroll at all. Mirrored as a Set in `proxy.ts`,
// which checks it on the route prefix before the page renders.
const WORKFORCE_MODULE_ALLOWED_ROLES: UserRole[] = ["SUPERADMIN", "MANAGER", "CLERK"];

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
  /**
   * Which group inside the section this belongs to. Items with no group render
   * first and unlabelled, which keeps every existing section rendering exactly
   * as it did.
   */
  group?: string;
};

/**
 * A labelled band of related items inside a section.
 *
 * Only worth it once a section is long enough that a flat list stops being
 * scannable — a sixteen-item CRM reads as inventory rather than navigation.
 * A group whose items are all gated away disappears with them.
 */
export type NavGroup = {
  id: string;
  label: string;
};

export type NavSection = {
  id: string;
  title: string;
  description?: string;
  featureKey?: string;
  /** Declares group order and labels. Groups with no visible items are dropped. */
  groups?: NavGroup[];
  /**
   * Render each group as its own root-level entry instead of as a band inside
   * this section. For a section whose title names a category rather than a
   * destination, the groups are the places people are actually going.
   */
  flattenGroups?: boolean;
  items: NavItem[];
};

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
    id: "daily",
    // Attendance left this section. Marking a register is not mining — a school,
    // a bureau and a workshop all keep one, and it is now People › Time ›
    // Attendance. What stays here is production reporting, which is.
    title: "Daily Operations",
    description: "Mining shift and plant capture",
    items: [
      {
        href: "/shift-report",
        icon: NoteAdd,
        label: "Submit Shift Report",
      },
      {
        href: "/plant-report",
        icon: Factory,
        label: "Submit Plant Report",
      },
    ],
  },
  {
    id: "reporting",
    title: "Reports",
    description: "Open report pages across operations",
    featureKey: "reports.dashboard",
    items: [
      { href: "/reports", icon: FileCheck, label: "Reports Dashboard" },
      { href: "/reports/shift", icon: EventNote, label: "Shift Reports" },
      { href: "/reports/attendance", icon: Checklist, label: "Attendance" },
      { href: "/reports/plant", icon: TableRows, label: "Plant Reports" },
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
      { href: "/reports/gold-chain", icon: ChartLine, label: "Gold Chain" },
      {
        href: "/reports/gold-receipts",
        icon: ReceiptLong,
        label: "Gold Receipts",
      },
      { href: "/reports/audit-trails", icon: FileCheck, label: "Audit Trails" },
      {
        href: "/reports/downtime",
        icon: BarChart3,
        label: "Downtime Analytics",
        roles: ["SUPERADMIN", "MANAGER"],
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
  // A school's sidebar is organised by *record*, not by department. The people
  // who use it — a registrar, a bursar, a boarding master, an examinations
  // officer — each go straight to the thing they run: Students, Fees, Boarding,
  // Results. So every entity with more than one page is its own top-level entry
  // that expands to its pages, and an entity with exactly one page is a
  // top-level link with no ceremony. Nothing is buried two levels down under a
  // department heading nobody says out loud.
  //
  // Classroom work is deliberately absent. Lesson plans, teaching resources,
  // homework and mark capture live in the teacher portal, because a teacher
  // does them and an administrator does not. The office keeps oversight —
  // who has not marked, moderation, publishing — which is a different question
  // asked of the same tables.
  //
  // Every group shares `schools.core`, so a tenant without the module loses the
  // whole set rather than being left with empty headings.
  {
    id: "schools",
    title: "School Operations",
    description: "Full school management operations and portals",
    featureKey: "schools.core",
    flattenGroups: true,
    groups: [
      { id: "students", label: "Students" },
      { id: "boarding", label: "Boarding" },
      { id: "academics", label: "Academic setup" },
      { id: "results", label: "Results" },
      { id: "fees", label: "Fees" },
      { id: "paperwork", label: "Reports and documents" },
    ],
    items: [
      { href: "/schools", icon: Building2, label: "School Overview" },

      // The registrar's desk: the roll and everything that changes it.
      { href: "/schools/students", icon: Users, label: "All students", group: "students" },
      { href: "/schools/admissions", icon: NoteAdd, label: "Admissions", group: "students" },
      { href: "/schools/students/roll-up", icon: History, label: "Roll up the year", group: "students" },
      { href: "/schools/imports", icon: Upload, label: "Import records", group: "students" },

      // One page each, so one click each. Top level, no expansion to open.
      { href: "/schools/guardians", icon: UserRound, label: "Guardians" },
      { href: "/schools/teachers", icon: ManageAccounts, label: "Teachers" },
      { href: "/schools/attendance", icon: UserCheck, label: "Attendance" },

      { href: "/schools/boarding", icon: Home, label: "Bed board", group: "boarding" },
      { href: "/schools/boarding/welfare", icon: ShieldCheck, label: "Health and welfare", group: "boarding" },

      { href: "/schools/academics", icon: TableRows, label: "Years and terms", group: "academics" },
      { href: "/schools/classes", icon: Checklist, label: "Classes", group: "academics" },
      { href: "/schools/subjects", icon: Dataset, label: "Subjects", group: "academics" },
      { href: "/schools/academics/syllabus", icon: Layers, label: "Scheme of work", group: "academics" },
      { href: "/schools/academics/identity", icon: UserRound, label: "Identity and records", group: "academics" },

      { href: "/schools/timetable", icon: Calendar, label: "Timetable" },
      { href: "/schools/homework", icon: ClipboardList, label: "Homework" },
      { href: "/schools/goals", icon: TrendingUp, label: "Subject targets" },
      { href: "/schools/meetings", icon: CalendarCheck, label: "Parent meetings" },

      { href: "/schools/results", icon: FileCheck, label: "Results overview", group: "results" },
      { href: "/schools/results/sheets", icon: Checklist, label: "Result sheets", group: "results" },
      { href: "/schools/results/moderation", icon: Scale, label: "Moderation", group: "results" },
      { href: "/schools/results/publish", icon: FileCheck, label: "Publishing", group: "results" },

      { href: "/schools/finance", icon: ReceiptLong, label: "Fees by year group", group: "fees" },
      { href: "/schools/finance/ledger", icon: Payments, label: "Ledger and structures", group: "fees" },
      { href: "/schools/finance/receipts", icon: ReceiptLong, label: "Receipts", group: "fees" },
      { href: "/schools/finance/refunds", icon: Wallet, label: "Refunds", group: "fees" },
      { href: "/schools/finance/waivers", icon: Scale, label: "Waivers", group: "fees" },

      { href: "/schools/library", icon: Dataset, label: "Library" },
      { href: "/schools/transport", icon: LocalShipping, label: "Transport" },
      { href: "/schools/notices", icon: EventNote, label: "Notices" },

      { href: "/schools/reports", icon: BarChart3, label: "School reports", group: "paperwork" },
      { href: "/schools/documents", icon: FileText, label: "Documents", group: "paperwork" },
    ],
  },
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
    id: "gold",
    title: "Gold Operations",
    description: "Production, settlement, and control tasks",
    featureKey: "gold.home",
    items: [
      { href: "/gold", icon: Coins, label: "Overview" },
      {
        href: "/gold/intake/pours/new",
        icon: Dataset,
        label: "Log Gold Output",
      },
      {
        href: "/gold/intake/purchases/new",
        icon: Payments,
        label: "Record Purchase",
      },
      {
        href: "/gold/transit/dispatches/new",
        icon: LocalShipping,
        label: "Record Dispatch",
      },
      {
        href: "/gold/settlement/receipts/new",
        icon: ReceiptLong,
        label: "Record Settlement Receipt",
      },
      { href: "/gold/exceptions", icon: ReportProblem, label: "Exceptions" },
      { href: "/reports/gold-chain", icon: ChartLine, label: "Gold Reports" },
    ],
  },
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
      { href: "/crm/follow-ups", icon: Phone, label: "Follow-ups", group: "work" },

      { href: "/crm/quotes", icon: FileText, label: "Quotes", group: "documents" },
      { href: "/crm/invoices", icon: ReceiptLong, label: "Invoices", group: "documents" },
      { href: "/crm/receipts", icon: Payments, label: "Receipts", group: "documents" },
      { href: "/crm/work-orders", icon: Wrench, label: "Work orders", group: "documents" },
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
        href: "/dashboard",
        icon: Dashboard,
        label: "Production Dashboard",
        roles: ["SUPERADMIN", "MANAGER"],
      },
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
