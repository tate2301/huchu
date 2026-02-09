import {
  BarChart3,
  Calendar,
  ClipboardList,
  Coins,
  Factory,
  FileCheck,
  FileText,
  Fuel,
  History,
  Home,
  Minus,
  Package,
  Plus,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react"
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
    items: [{ href: "/", icon: Home, label: "Home" }],
  },
  {
    id: "daily",
    title: "Today's Work",
    description: "Daily reports and attendance",
    items: [
      { href: "/shift-report", icon: ClipboardList, label: "Submit Shift Report" },
      { href: "/attendance", icon: Users, label: "Mark Attendance" },
      { href: "/plant-report", icon: Factory, label: "Submit Plant Report" },
    ],
  },
  {
    id: "hr",
    title: "People",
    description: "Employee records and attendance roster",
    items: [
      { href: "/human-resources", icon: UserRound, label: "Employees" },
      {
        href: "/human-resources/payouts",
        icon: Coins,
        label: "Payouts",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/human-resources/salaries",
        icon: UserRound,
        label: "Salary Setup",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "maintenance",
    title: "Maintenance",
    description: "Equipment, work orders, scheduling",
    items: [
      { href: "/maintenance", icon: Wrench, label: "Dashboard" },
      { href: "/maintenance/equipment", icon: Wrench, label: "Equipment Register" },
      { href: "/maintenance/work-orders", icon: ClipboardList, label: "Work Orders" },
      { href: "/maintenance/breakdown", icon: Plus, label: "Log Breakdown" },
      { href: "/maintenance/schedule", icon: Calendar, label: "PM Schedule" },
    ],
  },
  {
    id: "stores",
    title: "Stock & Fuel",
    description: "Inventory and fuel control",
    items: [
      { href: "/stores/dashboard", icon: Package, label: "Dashboard" },
      { href: "/stores/inventory", icon: Package, label: "Stock on Hand" },
      { href: "/stores/movements", icon: History, label: "Action Log" },
      { href: "/stores/fuel", icon: Fuel, label: "Fuel Log" },
      { href: "/stores/issue", icon: Minus, label: "Issue Stock" },
      { href: "/stores/receive", icon: Plus, label: "Receive Stock" },
    ],
  },
  {
    id: "gold",
    title: "Gold Control",
    description: "High-security workflows",
    items: [
      { href: "/gold", icon: Coins, label: "Overview" },
      { href: "/gold/pour", icon: Coins, label: "Record Pour" },
      { href: "/gold/dispatch", icon: Package, label: "Create Dispatch" },
      { href: "/gold/receipt", icon: FileCheck, label: "Buyer Receipt" },
      { href: "/gold/payouts", icon: Coins, label: "Worker Payouts" },
      { href: "/gold/reconciliation", icon: Shield, label: "Reconciliation" },
      { href: "/gold/audit", icon: FileText, label: "Audit Trail" },
    ],
  },
  {
    id: "management",
    title: "Management",
    description: "Analytics, dashboards, audits",
    items: [
      {
        href: "/analytics",
        icon: BarChart3,
        label: "Downtime Analytics",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/dashboard",
        icon: BarChart3,
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
        href: "/cctv",
        icon: Video,
        label: "CCTV",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/reports",
        icon: FileText,
        label: "Reports",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
]

const quickActions: QuickAction[] = [
  {
    href: "/shift-report",
    label: "Shift Report",
    description: "Submit today's shift output",
    icon: ClipboardList,
  },
  {
    href: "/attendance",
    label: "Attendance",
    description: "Mark today's crew attendance",
    icon: Users,
  },
  {
    href: "/stores/receive",
    label: "Receive Stock",
    description: "Log incoming stock",
    icon: Plus,
  },
  {
    href: "/stores/issue",
    label: "Issue Stock",
    description: "Record stock issue",
    icon: Minus,
  },
  {
    href: "/gold/pour",
    label: "Record Pour",
    description: "Create a new gold pour record",
    icon: Coins,
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
