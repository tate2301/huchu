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
    <div className="w-full space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading
        title={title}
        description={description}
        className="mb-4 [&_h1]:text-[1.375rem] [&_h1]:leading-8"
      />

      <nav
        aria-label="Human resources navigation"
        className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0 pb-1 shadow-[inset_0_-1px_0_0_var(--edge-neutral-rest)]"
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="size-5" />
              <span className="ml-2">{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      {children}
    </div>
  )
}
