"use client"

import Link from "next/link"
import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { cn } from "@/lib/utils"
import { type LucideIcon, UserRound, Wallet } from "lucide-react"

export type HrTab = "employees" | "payouts" | "salaries"

type HrTabItem = {
  id: HrTab
  label: string
  href: string
  icon: LucideIcon
}

const hrTabs: HrTabItem[] = [
  { id: "employees", label: "Employees", href: "/human-resources", icon: UserRound },
  { id: "payouts", label: "Payouts", href: "/human-resources/payouts", icon: Wallet },
  { id: "salaries", label: "Fixed Salaries", href: "/human-resources/salaries", icon: Wallet },
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
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} description={description} />

      <nav
        aria-label="Human resources navigation"
        className="flex w-full flex-wrap justify-start gap-2 border-b bg-transparent p-0"
      >
        {hrTabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-semibold transition-colors border-b border-transparent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
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
