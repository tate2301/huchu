"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useSession } from "next-auth/react"
import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter"
import { cn } from "@/lib/utils"
import { HR_TABS, type HrTab } from "@/lib/hr/tab-config"
import { getNavSectionsForRole } from "@/lib/navigation"
import { getWorkspaceModulePresentation } from "@/lib/workspace-products"

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
  title,
  description,
}: HrShellProps) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  )
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile
  const modulePresentation = useMemo(
    () =>
      getWorkspaceModulePresentation({
        moduleId: "hr",
        enabledFeatures,
        workspaceProfile,
      }),
    [enabledFeatures, workspaceProfile],
  )
  const visibleTabs = useMemo(
    () => {
      const hrSection = getNavSectionsForRole(role).find((section) => section.id === "hr")
      const visibleHrefs = new Set(
        filterHrefItemsByEnabledFeatures(hrSection?.items ?? [], enabledFeatures).map((item) => item.href),
      )
      return HR_TABS.filter((tab) => visibleHrefs.has(tab.href))
    },
    [enabledFeatures, role],
  )

  return (
    <div className="w-full space-y-5">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading
        title={title ?? modulePresentation.title}
        description={description ?? modulePresentation.description}
        className="mb-3"
      />

      <nav
        aria-label="Human resources navigation"
        className="flex w-full flex-wrap justify-start gap-1 border-b border-[var(--edge-subtle)] pb-1"
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-[var(--action-primary-bg)] text-[var(--action-primary-bg)]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="ml-2">{modulePresentation.tabLabels?.[tab.id] ?? tab.label}</span>
            </Link>
          )
        })}
      </nav>

      {children}
    </div>
  )
}
