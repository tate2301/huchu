import {
  Activity,
  BarChart3,
  Calendar,
  ClipboardList,
  Coins,
  Factory,
  FileCheck,
  FileText,
  Fuel,
  Home,
  Minus,
  Package,
  Plus,
  Shield,
  UserRound,
  Users,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export type NavSection = {
  id: string
  title: string
  description?: string
  items: NavItem[]
}

export const navSections: NavSection[] = [
  {
    id: "overview",
    title: "Overview",
    items: [{ href: "/", icon: Home, label: "Home" }],
  },
  {
    id: "daily",
    title: "Daily Operations",
    description: "Shift and production reporting",
    items: [
      { href: "/shift-report", icon: ClipboardList, label: "Shift Report" },
      { href: "/attendance", icon: Users, label: "Attendance" },
      { href: "/plant-report", icon: Factory, label: "Plant Report" },
    ],
  },
  {
    id: "hr",
    title: "Human Resources",
    description: "Employee records and attendance roster",
    items: [{ href: "/human-resources", icon: UserRound, label: "Employees" }],
  },
  {
    id: "maintenance",
    title: "Maintenance",
    description: "Equipment, work orders, scheduling",
    items: [
      { href: "/maintenance?view=dashboard", icon: Wrench, label: "Dashboard" },
      { href: "/maintenance?view=equipment", icon: Wrench, label: "Equipment Register" },
      { href: "/maintenance?view=work-orders", icon: ClipboardList, label: "Work Orders" },
      { href: "/maintenance?view=breakdown", icon: Plus, label: "Log Breakdown" },
      { href: "/maintenance?view=schedule", icon: Calendar, label: "PM Schedule" },
    ],
  },
  {
    id: "stores",
    title: "Stores & Fuel",
    description: "Inventory and fuel control",
    items: [
      { href: "/stores/dashboard", icon: Package, label: "Dashboard" },
      { href: "/stores/inventory", icon: Package, label: "Stock on Hand" },
      { href: "/stores/fuel", icon: Fuel, label: "Fuel Ledger" },
      { href: "/stores/issue", icon: Minus, label: "Issue Stock" },
      { href: "/stores/receive", icon: Plus, label: "Receive Stock" },
    ],
  },
  {
    id: "gold",
    title: "Gold Control",
    description: "High-security workflows",
    items: [
      { href: "/gold?view=menu", icon: Coins, label: "Overview" },
      { href: "/gold?view=pour", icon: Coins, label: "Record Pour" },
      { href: "/gold?view=dispatch", icon: Package, label: "Dispatch Manifest" },
      { href: "/gold?view=receipt", icon: FileCheck, label: "Buyer Receipt" },
      { href: "/gold?view=reconciliation", icon: Shield, label: "Reconciliation" },
      { href: "/gold?view=audit", icon: FileText, label: "Audit Trail" },
    ],
  },
  {
    id: "management",
    title: "Management & Compliance",
    description: "Analytics, dashboards, audits",
    items: [
      { href: "/analytics", icon: BarChart3, label: "Downtime Analytics" },
      { href: "/dashboard", icon: BarChart3, label: "Production Dashboard" },
      { href: "/compliance", icon: Shield, label: "Compliance" },
      { href: "/cctv", icon: Video, label: "CCTV Surveillance" },
      { href: "/reports", icon: FileText, label: "Reports" },
      { href: "/status", icon: Activity, label: "Implementation Status" },
    ],
  },
]
