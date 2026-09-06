"use client"

import "@/manifests";

import * as React from "react"
import { usePathname } from "next/navigation"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "next-auth/react"
import type { Session } from "next-auth"

import { OfflineChrome } from "@/components/offline"
import { AppearanceProvider } from "@/components/providers/appearance-provider"
import { OfflineProvider } from "@/components/providers/offline-provider"
import { TableExportProvider } from "@corelithzw/ui/lib/table-export"
import { documentsTableExporter } from "@/lib/documents/table-exporter"
import { Toaster } from "@corelithzw/ui/components/toaster"

/**
 * Whether the browser has told us it is offline.
 *
 * Guarded on `onLine` rather than on `navigator`, because Node defines a
 * global `navigator` without it and `!undefined` reads as "offline" anywhere
 * this runs outside a browser.
 */
function browserIsOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

export function AppProviders({
  children,
  /**
   * Resolved by the root layout on the server. Passed through so the session is
   * present during SSR — see the comment there for the hydration mismatch this
   * exists to prevent. `null` means signed out; `undefined` (nobody passing it)
   * would put the provider back in its fetch-on-mount behaviour.
   */
  session,
}: {
  children: React.ReactNode
  session?: Session | null
}) {
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
              if (browserIsOffline()) {
                return false
              }
              return failureCount < 2
            },
          },
          mutations: {
            networkMode: "offlineFirst",
            retry: (failureCount) => {
              if (browserIsOffline()) {
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
      session={session}
      refetchInterval={disableAdminSessionRefetchInDev ? 0 : 5 * 60}
      refetchOnWindowFocus={!disableAdminSessionRefetchInDev}
      refetchWhenOffline={false}
    >
      <QueryClientProvider client={queryClient}>
        <AppearanceProvider>
          <OfflineProvider>
            <TableExportProvider exporter={documentsTableExporter}>
            <OfflineChrome />
            {children}
            </TableExportProvider>
          </OfflineProvider>
        </AppearanceProvider>
        <Toaster />
      </QueryClientProvider>
    </SessionProvider>
  )
}
