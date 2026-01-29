"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calendar, Plus, Wrench } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const navItems = [
  {
    href: "/maintenance",
    label: "Dashboard",
    icon: Wrench,
  },
  {
    href: "/maintenance/equipment",
    label: "Equipment Register",
  },
  {
    href: "/maintenance/work-orders",
    label: "Work Orders",
  },
  {
    href: "/maintenance/breakdown",
    label: "Log Breakdown",
    icon: Plus,
  },
  {
    href: "/maintenance/schedule",
    label: "PM Schedule",
    icon: Calendar,
  },
]

export function MaintenanceNav() {
  const pathname = usePathname()

  return (
    <Card>
      <CardContent className="py-3">
        <nav className="flex w-full flex-wrap justify-start gap-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all border border-border",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:pointer-events-none disabled:opacity-50",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "bg-transparent hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {item.label}
              </Link>
            )
          })}
        </nav>
      </CardContent>
    </Card>
  )
}
