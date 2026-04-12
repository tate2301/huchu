"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "next-auth/react"

import { OfflineProvider } from "@/components/providers/offline-provider"
import { Toaster } from "@/components/ui/toaster"

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            networkMode: "offlineFirst",
            gcTime: 30 * 24 * 60 * 60 * 1000,
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount) => {
              if (typeof navigator !== "undefined" && !navigator.onLine) {
                return false
              }
              return failureCount < 2
            },
          },
          mutations: {
            networkMode: "offlineFirst",
            retry: (failureCount) => {
              if (typeof navigator !== "undefined" && !navigator.onLine) {
                return false
              }
              return failureCount < 1
            },
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
        <OfflineProvider>{children}</OfflineProvider>
        <Toaster />
      </QueryClientProvider>
    </SessionProvider>
  )
}
