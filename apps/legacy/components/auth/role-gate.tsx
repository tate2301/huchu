"use client"

import { ShieldAlert } from "@/lib/icons"
import { useSession } from "next-auth/react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { hasRole, type UserRole } from "@/lib/roles"

type RoleGateProps = {
  allowed: UserRole[]
  children: React.ReactNode
  fallbackTitle?: string
  fallbackDescription?: string
}

export function RoleGate({
  allowed,
  children,
  fallbackTitle = "Permission required",
  fallbackDescription = "You do not have access to perform this action.",
}: RoleGateProps) {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return null
  }

  const role = (session?.user as { role?: string })?.role
  if (hasRole(role, allowed)) {
    return <>{children}</>
  }

  return (
    <Alert variant="warning">
      <ShieldAlert className="h-4 w-4" />
      <div>
        <AlertTitle>{fallbackTitle}</AlertTitle>
        <AlertDescription>{fallbackDescription}</AlertDescription>
      </div>
    </Alert>
  )
}
