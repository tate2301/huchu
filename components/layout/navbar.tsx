"use client"

import Link from "next/link"
import { LogOut, User } from "lucide-react"
import { useSession } from "next-auth/react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { usePageActions } from "@/components/layout/page-actions"

export function Navbar() {
  const { actions } = usePageActions()
  const { data: session } = useSession()

  return (
    <header className="sticky top-0 z-20 h-16 max-h-16 border-b border-border bg-card">
      <div className="flex h-16 items-center gap-3 px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="hidden h-6 md:block" />
        <Breadcrumbs />
        <div className="ml-auto flex items-center gap-3">
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          <div className="hidden h-6 w-px bg-border md:block" />
          {session ? (
            <div className="hidden items-center gap-3 md:flex">
              <div className="text-right text-xs">
                <div className="font-semibold text-foreground">{session.user?.name}</div>
                <div className="text-muted-foreground">
                  {(session.user as { role?: string })?.role ?? "User"}
                </div>
              </div>
              <Link href="/api/auth/signout">
                <Button variant="outline" size="sm">
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </Link>
            </div>
          ) : (
            <Link href="/login" className="hidden md:block">
              <Button variant="outline" size="sm">
                <User className="h-4 w-4" />
                Login
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
