"use client"

import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { usePageActions } from "@/components/layout/page-actions"
import { NotificationCenter } from "@/components/notifications/notification-center"
import { canAccessCapabilityWithToken } from "@/lib/platform/gating/token-check"

export function Navbar() {
  const { actions } = usePageActions()
  const pathname = usePathname()
  const { data: session } = useSession()
  const enabledFeatures =
    (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures
  const showNotificationCenter = canAccessCapabilityWithToken(
    "notification.center.widget",
    enabledFeatures,
  ).allowed

  const successHint = getSuccessHint(pathname)

  return (
    <header className="sticky top-0 z-20 h-[3.75rem] max-h-[3.75rem] bg-[var(--surface-overlay)] shadow-[inset_0_-1px_0_0_var(--edge-subtle)] backdrop-blur-md">
      <div className="content-shell flex h-[3.75rem] items-center gap-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="hidden h-6 md:block" />
        <div className="min-w-0">
          <Breadcrumbs />
          {successHint ? (
            <p className="hidden truncate text-xs text-muted-foreground lg:block">
              {successHint}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {showNotificationCenter ? <NotificationCenter /> : null}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </header>
  )
}

function getSuccessHint(pathname: string) {
  const hints: Array<{ prefix: string; hint: string }> = [
    { prefix: "/shift-report", hint: "Success: report is submitted and highlighted in the table." },
    { prefix: "/attendance", hint: "Success: today's attendance batch appears in the records list." },
    { prefix: "/plant-report", hint: "Success: report appears in the list for the selected date range." },
    { prefix: "/stores", hint: "Success: stock action appears in the movement log." },
    { prefix: "/gold", hint: "Success: the saved gold record appears in history below the form." },
  ]

  return hints.find((entry) => pathname.startsWith(entry.prefix))?.hint ?? null
}
