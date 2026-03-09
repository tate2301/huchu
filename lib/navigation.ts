import {
  AlertCircle,
  ArrowDownward,
  ArrowUpward,
  BarChart3,
  Building2,
  Calendar,
  Camera,
  ChartLine,
  Checklist,
  Coins,
  Dashboard,
  Dataset,
  EventNote,
  Factory,
  FileCheck,
  FileText,
  Fuel,
  History,
  LocalShipping,
  ManageAccounts,
  NoteAdd,
  ReceiptLong,
  Recycle,
  ReportProblem,
  TableRows,
  Home,
  Package,
  PackageCheck,
  ShieldCheck,
  Server,
  Scale,
  UserRound,
  Users,
  UserCheck,
  Video,
  Wallet,
  Payments,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";
import { hasRole, type UserRole } from "@/lib/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
};

export type NavSection = {
  id: string;
  title: string;
  description?: string;
  items: NavItem[];
};

export type QuickAction = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  roles?: UserRole[];
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
    title: "Quick Actions",
    description: "Daily forms and stock tasks",
    items: [
      {
        href: "/shift-report",
        icon: NoteAdd,
        label: "Submit Shift Report",
        roles: ["SUPERADMIN"],
      },
      {
        href: "/attendance",
        icon: UserCheck,
        label: "Mark Attendance",
        roles: ["SUPERADMIN"],
      },
      {
        href: "/plant-report",
        icon: Factory,
        label: "Submit Plant Report",
        roles: ["SUPERADMIN"],
      },
      { href: "/stores/receive", icon: ArrowDownward, label: "Receive Stock" },
      { href: "/stores/issue", icon: ArrowUpward, label: "Issue Stock" },
      {
        href: "/gold/intake/pours/new",
        icon: Dataset,
        label: "Log Gold Output",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/gold/intake/purchases/new",
        icon: Payments,
        label: "Record Gold Purchase",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "reporting",
    title: "Reports",
    description: "Open report pages across operations",
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
      {
        href: "/reports/cctv-events",
        icon: Video,
        label: "CCTV Events",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "hr",
    title: "Human Resources",
    description: "Employee records and attendance roster",
    items: [
      { href: "/human-resources", icon: ManageAccounts, label: "Employees" },
      {
        href: "/human-resources/shift-groups",
        icon: Users,
        label: "Shift Groups",
      },
      {
        href: "/human-resources/incidents",
        icon: ShieldCheck,
        label: "Workforce Incidents",
      },
      {
        href: "/human-resources/payouts",
        icon: Coins,
        label: "Gold Payouts",
      },
      {
        href: "/human-resources/compensation",
        icon: UserRound,
        label: "Compensation Rules",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/human-resources/salaries",
        icon: Payments,
        label: "Salary Ops",
      },
      {
        href: "/human-resources/salaries/outstanding",
        icon: Wallet,
        label: "Outstanding Salaries",
      },
      {
        href: "/human-resources/payroll",
        icon: Checklist,
        label: "Payroll Runs",
      },
      {
        href: "/human-resources/disbursements",
        icon: Wallet,
        label: "Disbursements",
      },
      {
        href: "/human-resources/approvals",
        icon: FileCheck,
        label: "Approval History",
      },
    ],
  },
  {
    id: "maintenance",
    title: "Assets",
    description: "Equipment, work orders, scheduling",
    items: [
      { href: "/maintenance", icon: Dashboard, label: "Dashboard" },
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
    title: "Stock",
    description: "Inventory and fuel control",
    items: [
      { href: "/stores/dashboard", icon: Dashboard, label: "Dashboard" },
      { href: "/stores/inventory", icon: Package, label: "Stock on Hand" },
      { href: "/stores/movements", icon: History, label: "Action Log" },
      { href: "/stores/fuel", icon: Fuel, label: "Fuel Log" },
      { href: "/stores/issue", icon: ArrowUpward, label: "Issue Stock" },
      { href: "/stores/receive", icon: ArrowDownward, label: "Receive Stock" },
    ],
  },
  {
    id: "schools",
    title: "School Operations",
    description: "Full school management operations and portals",
    items: [
      { href: "/schools", icon: Building2, label: "School Overview" },
      { href: "/schools/students", icon: Users, label: "Students" },
      { href: "/schools/admissions", icon: EventNote, label: "Admissions" },
      { href: "/schools/academics", icon: TableRows, label: "Academics" },
      { href: "/schools/timetable", icon: Calendar, label: "Timetable" },
      { href: "/schools/attendance", icon: UserCheck, label: "Attendance" },
      { href: "/schools/boarding", icon: Home, label: "Boarding" },
      { href: "/schools/teachers", icon: ManageAccounts, label: "Teachers" },
      { href: "/schools/assessments", icon: FileCheck, label: "Assessments" },
      { href: "/schools/results/moderation", icon: FileCheck, label: "Results Moderation" },
      { href: "/schools/results/publish", icon: FileCheck, label: "Results Publishing" },
      { href: "/schools/finance", icon: ReceiptLong, label: "Finance" },
      { href: "/schools/notices", icon: EventNote, label: "Notices" },
      { href: "/schools/reports", icon: BarChart3, label: "School Reports" },
      { href: "/schools/documents", icon: FileText, label: "Documents" },
      { href: "/schools/portal/parent", icon: Users, label: "Parent Portal" },
      { href: "/schools/portal/student", icon: UserCheck, label: "Student Portal" },
      { href: "/schools/portal/teacher", icon: ManageAccounts, label: "Teacher Portal" },
    ],
  },
  {
    id: "car-sales",
    title: "Auto Sales",
    description: "Vehicle sales pipeline and deal operations",
    items: [
      { href: "/car-sales", icon: LocalShipping, label: "Auto Overview" },
      { href: "/car-sales/leads", icon: Users, label: "Leads" },
      { href: "/car-sales/inventory", icon: Package, label: "Inventory" },
      { href: "/car-sales/deals", icon: Checklist, label: "Deals" },
      { href: "/car-sales/financing", icon: Wallet, label: "Financing" },
    ],
  },
  {
    id: "thrift",
    title: "Smart Shop",
    description: "Shop operations, checkout, and POS",
    items: [
      { href: "/thrift", icon: Wallet, label: "Shop Overview" },
      { href: "/thrift/intake", icon: ArrowDownward, label: "Intake" },
      { href: "/thrift/catalog", icon: Package, label: "Catalog" },
      { href: "/thrift/sales", icon: ReceiptLong, label: "Sales" },
      { href: "/portal/pos", icon: Payments, label: "Point of Sale" },
    ],
  },
  {
    id: "gold",
    title: "Gold Control",
    description: "Simple daily gold tasks",
    items: [
      { href: "/gold", icon: Coins, label: "Gold Home" },
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
        label: "Record Receipt",
      },
      { href: "/gold/exceptions", icon: ReportProblem, label: "Problems" },
      { href: "/reports/gold-chain", icon: ChartLine, label: "Reports" },
    ],
  },
  {
    id: "scrap-metal",
    title: "Scrap Metal",
    description: "Scrap metal buying and sales operations",
    items: [
      { href: "/scrap-metal", icon: Recycle, label: "Scrap Metal Home" },
      { href: "/scrap-metal/purchases", icon: Payments, label: "Purchases" },
      { href: "/scrap-metal/batches", icon: Package, label: "Batches" },
      { href: "/scrap-metal/sales", icon: ReceiptLong, label: "Sales", roles: ["SUPERADMIN", "MANAGER"] },
      { href: "/scrap-metal/pricing", icon: Coins, label: "Pricing" },
    ],
  },
  {
    id: "cctv",
    title: "CCTV",
    description: "Surveillance and stream control",
    items: [
      {
        href: "/cctv/overview",
        icon: Dashboard,
        label: "Overview",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/cctv/live",
        icon: Video,
        label: "Live Monitor",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/cctv/cameras",
        icon: Camera,
        label: "Cameras",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/cctv/nvrs",
        icon: Server,
        label: "NVRs",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/cctv/events",
        icon: AlertCircle,
        label: "Events",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/cctv/playback",
        icon: History,
        label: "Playback",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/cctv/access-logs",
        icon: FileCheck,
        label: "Access Logs",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "accounting",
    title: "Accounting",
    description: "Ledger, journals, and finance controls",
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
        href: "/management/users",
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
        href: "/settings/branding",
        icon: Building2,
        label: "Branding",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/settings/templates",
        icon: FileText,
        label: "Document Templates",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
];

const quickActions: QuickAction[] = [
  {
    href: "/shift-report",
    label: "Shift Report",
    description: "Submit today's shift output",
    icon: NoteAdd,
  },
  {
    href: "/attendance",
    label: "Attendance",
    description: "Mark today's crew attendance",
    icon: UserCheck,
  },
  {
    href: "/stores/receive",
    label: "Receive Stock",
    description: "Log incoming stock",
    icon: ArrowDownward,
  },
  {
    href: "/stores/issue",
    label: "Issue Stock",
    description: "Record stock issue",
    icon: ArrowUpward,
  },
  {
    href: "/gold/intake/pours/new",
    label: "Log Gold Output",
    description: "Record gold produced for the shift",
    icon: Dataset,
    roles: ["SUPERADMIN", "MANAGER"],
  },
  {
    href: "/gold/intake/purchases/new",
    label: "Record Purchase",
    description: "Capture gold bought from walk-in sellers",
    icon: Payments,
    roles: ["SUPERADMIN", "MANAGER"],
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

export function getQuickActionsForRole(role: string | null | undefined) {
  return quickActions.filter((action) =>
    action.roles ? hasRole(role, action.roles) : true,
  );
}
