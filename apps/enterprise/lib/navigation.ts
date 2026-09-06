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
  Layers,
  Mail,
  MedusaBookOpenIcon,
  Receipt,
  History,
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
} from "@corelithzw/ui/lib/icons";
import { PEOPLE_TABS } from "@corelithzw/module-people/people/tab-config";
import { PAYROLL_TABS } from "@corelithzw/module-people/payroll/tab-config";
import { hasRole, type UserRole } from "@corelithzw/platform/roles";

// Who may reach People and Payroll at all. Mirrored as a Set in `proxy.ts`,
// which checks it on the route prefix before the page renders.
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
    id: "schools",
    title: "School Operations",
    description: "Full school management operations and portals",
    featureKey: "schools.core",
    flattenGroups: true,
    groups: [
      { id: "students", label: "Students" },
      { id: "attendance", label: "Attendance" },
      { id: "academics", label: "Academics" },
      { id: "teaching", label: "Teaching" },
      { id: "results", label: "Results" },
      { id: "boarding", label: "Boarding" },
      { id: "fees", label: "Fees" },
      { id: "people", label: "People" },
      { id: "communication", label: "Communication" },
      { id: "services", label: "Services" },
      { id: "paperwork", label: "Reports and documents" },
    ],
    // Alphabetical within every band. A school's nav is a reference list, not a
    // narrative: nobody reads it top to bottom, they look for a word they
    // already have in mind, and a hand-ordered band means scanning all of it to
    // find out the order was somebody's opinion. The only item exempt is an
    // "Overview" — a band's own front page is not one of its siblings.
    items: [
      { href: "/schools", icon: Building2, label: "Overview" },

      // The roll and everything that changes it.
      { href: "/schools/admissions", icon: NoteAdd, label: "Applications", group: "students" },
      { href: "/schools/imports", icon: Upload, label: "Import records", group: "students" },
      { href: "/schools/students/roll-up", icon: History, label: "Roll up the year", group: "students" },
      { href: "/schools/students", icon: Users, label: "Students", group: "students" },

      // Oversight, not a register. An administrator arrives at the whole school
      // and narrows to a class; the class-by-class rail belongs to the page,
      // which is the only thing that knows tonight's year groups.
      { href: "/schools/attendance/follow-up", icon: ReportProblem, label: "Absence follow-up", group: "attendance" },
      { href: "/schools/attendance", icon: UserCheck, label: "Whole school", group: "attendance" },

      // Years, terms, classes, subjects, periods and grading are master data and
      // live under Management. These reach across so nobody has to know that.
      {
        href: "/management/master-data/schools/years",
        icon: Dataset,
        label: "Academic setup",
        group: "academics",
      },
      { href: "/schools/calendar", icon: Calendar, label: "Calendar", group: "academics" },
      {
        href: "/management/master-data/schools/identity",
        icon: TableRows,
        label: "Identity and records",
        group: "academics",
      },
      // Rooms are one half of `school-day-content` — the periods a day is cut
      // into, and the rooms lessons run in, which are the two axes of the same
      // timetable. Pointing at the tab beats a second rooms screen that would
      // drift from it.
      {
        href: "/management/master-data/schools/periods?view=rooms",
        icon: MapPin,
        label: "Rooms",
        group: "academics",
      },
      { href: "/schools/academics/syllabus", icon: Layers, label: "Scheme of work", group: "academics" },

      { href: "/schools/homework", icon: ClipboardList, label: "Homework", group: "teaching" },
      { href: "/schools/teaching/lessons", icon: MedusaBookOpenIcon, label: "Lesson plans", group: "teaching" },
      { href: "/schools/goals", icon: TrendingUp, label: "Subject targets", group: "teaching" },
      { href: "/schools/teaching/resources", icon: FileText, label: "Teaching resources", group: "teaching" },
      { href: "/schools/timetable", icon: Calendar, label: "Timetable", group: "teaching" },

      // A workflow, not a screen: a sheet is submitted, moderated, sent back or
      // approved, then published, and each of those is somebody different's move.
      { href: "/schools/results", icon: FileCheck, label: "Overview", group: "results" },
      { href: "/schools/results/moderation", icon: Scale, label: "Moderation", group: "results" },
      { href: "/schools/results/publish", icon: FileCheck, label: "Publishing", group: "results" },
      { href: "/schools/results/publish/windows", icon: Calendar, label: "Publishing windows", group: "results" },
      { href: "/schools/results/sheets", icon: Checklist, label: "Result sheets", group: "results" },

      { href: "/schools/boarding/allocations", icon: Checklist, label: "Allocations", group: "boarding" },
      { href: "/schools/boarding", icon: Home, label: "Bed board", group: "boarding" },
      { href: "/schools/boarding/welfare", icon: ShieldCheck, label: "Health and welfare", group: "boarding" },
      { href: "/schools/boarding/hostels", icon: Building2, label: "Hostels", group: "boarding" },
      { href: "/schools/boarding/leave", icon: CalendarCheck, label: "Leave and outings", group: "boarding" },

      // Each ledger label opens the ledger on the tab it names. They used to be
      // routes of their own that redirected to the year-group PICKER, so
      // "Waivers" landed a bursar on a grid of class cards — three labels
      // pointing at a fourth screen. One ledger, one tab per label.
      { href: "/schools/finance/arrears", icon: ReportProblem, label: "Arrears and ageing", group: "fees" },
      { href: "/schools/finance/ledger?view=credits", icon: Coins, label: "Credits on account", group: "fees" },
      { href: "/schools/finance", icon: ReceiptLong, label: "Fees by year group", group: "fees" },
      { href: "/schools/finance/ledger?view=invoices", icon: Receipt, label: "Invoices", group: "fees" },
      { href: "/schools/finance/ledger", icon: Payments, label: "Ledger and structures", group: "fees" },
      { href: "/schools/finance/ledger?view=receipts", icon: ReceiptLong, label: "Receipts", group: "fees" },
      { href: "/schools/finance/ledger?view=refunds", icon: Wallet, label: "Refunds", group: "fees" },
      { href: "/schools/finance/ledger?view=waivers", icon: Scale, label: "Waivers", group: "fees" },

      { href: "/schools/guardians", icon: UserRound, label: "Guardians", group: "people" },
      { href: "/schools/teachers/assignments", icon: Checklist, label: "Staff assignments", group: "people" },
      // Everybody a school employs who does not teach — the bursar, the nurse,
      // the grounds team. They are HR employees carrying the SCHOOLS
      // assignment, so payroll and leave stay in one place; this is the
      // school's window onto its own.
      { href: "/schools/staff", icon: ManageAccounts, label: "Support staff", group: "people" },
      { href: "/schools/teachers", icon: ManageAccounts, label: "Teaching staff", group: "people" },

      // What the school has said, and what has been said to it. A notice goes
      // out to many and cannot be replied to; a message is one family and one
      // member of staff. Keeping them adjacent is how somebody learns which
      // one they wanted.
      { href: "/schools/messages", icon: Mail, label: "Messages", group: "communication" },
      { href: "/schools/notices", icon: EventNote, label: "Notices", group: "communication" },
      { href: "/schools/meetings", icon: CalendarCheck, label: "Parent meetings", group: "communication" },

      { href: "/schools/library", icon: Dataset, label: "Library", group: "services" },
      { href: "/schools/library/loans", icon: MedusaBookOpenIcon, label: "Library loans", group: "services" },
      { href: "/schools/transport", icon: LocalShipping, label: "Transport", group: "services" },

      { href: "/schools/documents", icon: FileText, label: "Documents", group: "paperwork" },
      { href: "/schools/reports", icon: BarChart3, label: "School reports", group: "paperwork" },
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
