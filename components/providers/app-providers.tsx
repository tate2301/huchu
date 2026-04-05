"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "next-auth/react"

import { Toaster } from "@/components/ui/toaster"

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )
  const isAdminRoute =
    pathname === "/admin" ||
    pathname?.startsWith("/admin/") ||
    pathname === "/portal/admin" ||
    pathname?.startsWith("/portal/admin/")
  const disableAdminSessionRefetchInDev =
    process.env.NODE_ENV !== "production" && isAdminRoute

  return (
    <SessionProvider
      refetchInterval={disableAdminSessionRefetchInDev ? 0 : 5 * 60}
      refetchOnWindowFocus={!disableAdminSessionRefetchInDev}
      refetchWhenOffline={false}
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </SessionProvider>
  )
}
