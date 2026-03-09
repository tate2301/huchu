"use client"

import Link from "next/link"
import { Checklist, Coins } from "@/lib/icons"
import { cn } from "@/lib/utils"

type PayrollMode = "salary" | "gold"

type PayrollModeSwitchProps = {
  activeMode: PayrollMode
}

const items: Array<{
  id: PayrollMode
  label: string
  href: string
  description: string
  icon: typeof Checklist
}> = [
  {
    id: "salary",
    label: "Salary Payroll",
    href: "/human-resources/payroll/salary",
    description: "Monthly payroll runs for permanent employees and staff.",
    icon: Checklist,
  },
  {
    id: "gold",
    label: "Irregular Payout Payroll",
    href: "/human-resources/payroll/gold",
    description: "Variable payout runs (currently gold allocations) prepared for disbursement.",
    icon: Coins,
  },
]

export function PayrollModeSwitch({ activeMode }: PayrollModeSwitchProps) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map((item) => {
        const isActive = item.id === activeMode
        return (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "rounded-lg border p-3 transition-colors",
              isActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/40",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <item.icon className="size-4" />
              {item.label}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
          </Link>
        )
      })}
    </div>
  )
}

