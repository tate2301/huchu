import {
  AlertCircle,
  ArrowDownward,
  ArrowRightLeft,
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
  ReportProblem,
  TableRows,
  Home,
  Package,
  PackageCheck,
  ShieldCheck,
  Server,
  Scale,
  UserRound,
  UserCheck,
  Video,
  Wallet,
  Payments,
  QrCode,
  Wrench,
  type LucideIcon,
} from "@/lib/icons"
import { hasRole, type UserRole } from "@/lib/roles"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  roles?: UserRole[]
}

export type NavSection = {
  id: string
  title: string
  description?: string
  items: NavItem[]
}

export type QuickAction = {
  href: string
  label: string
  description: string
  icon: LucideIcon
  roles?: UserRole[]
}

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
      { href: "/shift-report", icon: NoteAdd, label: "Submit Shift Report" },
      { href: "/attendance", icon: UserCheck, label: "Mark Attendance" },
      { href: "/plant-report", icon: Factory, label: "Submit Plant Report" },
      { href: "/stores/receive", icon: ArrowDownward, label: "Receive Stock" },
      { href: "/stores/issue", icon: ArrowUpward, label: "Issue Stock" },
      {
        href: "/gold/intake/pours/new",
        icon: Dataset,
        label: "Log Gold Output",
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
      { href: "/reports/stores-movements", icon: History, label: "Stock Movements" },
      { href: "/reports/fuel-ledger", icon: Fuel, label: "Fuel Ledger" },
      { href: "/reports/maintenance-work-orders", icon: Wrench, label: "Work Orders" },
      { href: "/reports/maintenance-equipment", icon: Package, label: "Equipment Service" },
      { href: "/reports/gold-chain", icon: ChartLine, label: "Gold Chain" },
      { href: "/reports/gold-receipts", icon: ReceiptLong, label: "Gold Receipts" },
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
    title: "People",
    description: "Employee records and attendance roster",
    items: [
      { href: "/human-resources", icon: ManageAccounts, label: "Employees" },
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
      { href: "/human-resources/disbursements", icon: Wallet, label: "Disbursements" },
      {
        href: "/human-resources/approvals",
        icon: FileCheck,
        label: "Approval History",
      },
    ],
  },
  {
    id: "maintenance",
    title: "Maintenance",
    description: "Equipment, work orders, scheduling",
    items: [
      { href: "/maintenance", icon: Dashboard, label: "Dashboard" },
      { href: "/maintenance/equipment", icon: Wrench, label: "Equipment Register" },
      { href: "/maintenance/work-orders", icon: Checklist, label: "Work Orders" },
      { href: "/maintenance/breakdown", icon: ReportProblem, label: "Log Breakdown" },
      { href: "/maintenance/schedule", icon: Calendar, label: "PM Schedule" },
    ],
  },
  {
    id: "stores",
    title: "Stock & Fuel",
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
    id: "gold",
    title: "Gold Control",
    description: "Simple daily gold tasks",
    items: [
      { href: "/gold", icon: Coins, label: "Gold Home" },
      { href: "/gold/intake/pours/new", icon: Dataset, label: "Log Gold Output" },
      { href: "/gold/transit/dispatches/new", icon: LocalShipping, label: "Record Dispatch" },
      { href: "/gold/settlement/receipts/new", icon: ReceiptLong, label: "Record Receipt" },
      { href: "/gold/exceptions", icon: ReportProblem, label: "Problems" },
      { href: "/reports/gold-chain", icon: ChartLine, label: "Reports" },
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
      { href: "/accounting/chart-of-accounts", icon: TableRows, label: "Chart of Accounts" },
      { href: "/accounting/journals", icon: FileCheck, label: "Journal Entries" },
      { href: "/accounting/periods", icon: Calendar, label: "Accounting Periods" },
      { href: "/accounting/trial-balance", icon: BarChart3, label: "Trial Balance" },
      { href: "/accounting/financial-statements", icon: BarChart3, label: "Financial Statements" },
      { href: "/accounting/posting-rules", icon: Checklist, label: "Posting Rules" },
      { href: "/accounting/sales", icon: ReceiptLong, label: "Sales (AR)" },
      { href: "/accounting/purchases", icon: PackageCheck, label: "Purchases (AP)" },
      { href: "/accounting/banking", icon: Wallet, label: "Banking" },
      { href: "/accounting/assets", icon: Package, label: "Fixed Assets" },
      { href: "/accounting/budgets", icon: BarChart3, label: "Budgets" },
      { href: "/accounting/cost-centers", icon: ManageAccounts, label: "Cost Centers" },
      { href: "/accounting/currency", icon: ArrowRightLeft, label: "Currency Rates" },
      { href: "/accounting/tax", icon: ShieldCheck, label: "Tax Setup" },
      { href: "/accounting/fiscalisation", icon: QrCode, label: "ZIMRA Fiscalisation" },
    ],
  },
  {
    id: "management",
    title: "Management",
    description: "Dashboards and management modules",
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
        roles: ["SUPERADMIN"],
      },
    ],
  },
]

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
]

export function getNavSectionsForRole(role: string | null | undefined) {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.roles ? hasRole(role, item.roles) : true,
      ),
    }))
    .filter((section) => section.items.length > 0)
}

export function getQuickActionsForRole(role: string | null | undefined) {
  return quickActions.filter((action) =>
    action.roles ? hasRole(role, action.roles) : true,
  )
}
