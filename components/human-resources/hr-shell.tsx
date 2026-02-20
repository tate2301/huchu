"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useSession } from "next-auth/react"
import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter"
import { cn } from "@/lib/utils"
import {
  type LucideIcon,
  Checklist,
  Coins,
  ManageAccounts,
  Payments,
  ShieldCheck,
  UserRound,
  Wallet,
} from "@/lib/icons"

export type HrTab =
  | "employees"
  | "shift-groups"
  | "incidents"
  | "payouts"
  | "salaries"
  | "salary-outstanding"
  | "compensation"
  | "payroll"
  | "disbursements"
  | "approvals"

type HrTabItem = {
  id: HrTab
  label: string
  href: string
  icon: LucideIcon
}

const hrTabs: HrTabItem[] = [
  { id: "employees", label: "Employees", href: "/human-resources", icon: ManageAccounts },
  {
    id: "shift-groups",
    label: "Shift Groups",
    href: "/human-resources/shift-groups",
    icon: UserRound,
  },
  {
    id: "incidents",
    label: "Workforce Incidents",
    href: "/human-resources/incidents",
    icon: ShieldCheck,
  },
  { id: "payouts", label: "Gold Payouts", href: "/human-resources/payouts", icon: Coins },
  { id: "salaries", label: "Salary Ops", href: "/human-resources/salaries", icon: Payments },
  {
    id: "salary-outstanding",
    label: "Outstanding Salaries",
    href: "/human-resources/salaries/outstanding",
    icon: Wallet,
  },
  {
    id: "compensation",
    label: "Compensation",
    href: "/human-resources/compensation",
    icon: UserRound,
  },
  { id: "payroll", label: "Payroll", href: "/human-resources/payroll", icon: Checklist },
  {
    id: "disbursements",
    label: "Disbursements",
    href: "/human-resources/disbursements",
    icon: Wallet,
  },
  {
    id: "approvals",
    label: "Approvals",
    href: "/human-resources/approvals",
    icon: ShieldCheck,
  },
]

type HrShellProps = {
  activeTab: HrTab
  actions?: React.ReactNode
  children: React.ReactNode
  title?: string
  description?: string
}

export function HrShell({
  activeTab,
  actions,
  children,
  title = "Human Resources",
  description = "Employee records and payout management",
}: HrShellProps) {
  const { data: session } = useSession()
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  )
  const visibleTabs = useMemo(
    () => filterHrefItemsByEnabledFeatures(hrTabs, enabledFeatures),
    [enabledFeatures],
  )

  return (
    <div className="w-full space-y-5">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading
        title={title}
        description={description}
        className="mb-3 [&_h1]:text-[1.3rem] [&_h1]:leading-8 [&_h1]:font-semibold"
      />

      <nav
        aria-label="Human resources navigation"
        className="flex w-full flex-wrap justify-start gap-1 rounded-xl bg-[var(--surface-subtle)] p-1.5 shadow-[var(--surface-frame-shadow)]"
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-[color,background-color,box-shadow]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "bg-[var(--surface-panel)] text-foreground shadow-[var(--surface-frame-shadow)]"
                  : "text-muted-foreground hover:bg-[var(--surface-soft)] hover:text-foreground",
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="ml-2">{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      {children}
    </div>
  )
}
