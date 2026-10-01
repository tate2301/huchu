"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { del, get, set } from "idb-keyval"
import { SessionProvider } from "next-auth/react"
import type { Session } from "next-auth"

import { OfflineChrome } from "@/components/offline/offline-chrome"
import { OfflineRuntime } from "@/components/offline/offline-runtime"
import { AppearanceProvider } from "@/components/providers/appearance-provider"
import { Toaster } from "@/components/ui/toaster"
import { isRefusal } from "@/lib/api-client"

/** Kept query results live as long as the client keeps them in memory. */
const PERSISTED_QUERY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Bump when a persisted query's shape changes incompatibly; every device then
 * drops its copy instead of rendering stale shapes.
 */
const PERSISTED_QUERY_BUSTER = "1"

/**
 * Where a tenant's query results are kept between visits, so the pages a
 * device has seen still have their data offline.
 *
 * One key per tenant: signing in to a second workspace on the same device
 * restores that workspace's data and never the first one's.
 */
function createTenantPersister(tenantKey: string) {
  return createAsyncStoragePersister({
    storage: { getItem: get, setItem: set, removeItem: del },
    key: `huchu-query-cache:${tenantKey}`,
  })
}

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
            retry: (failureCount, error) => {
              if (browserIsOffline() || isRefusal(error)) {
                return false
              }
              return failureCount < 2
            },
          },
          mutations: {
            networkMode: "offlineFirst",
            // A refused save (a taken name, a failed check) is the server's
            // answer, not a blip, so only failures that might pass are retried.
            retry: (failureCount, error) => {
              if (browserIsOffline() || isRefusal(error)) {
                return false
              }
              return failureCount < 1
            },
          },
        },
      }),
  )
  const tenantKey =
    (session?.user as { companyId?: string } | undefined)?.companyId ?? null
  const persistOptions = React.useMemo(
    () =>
      tenantKey
        ? {
            persister: createTenantPersister(tenantKey),
            maxAge: PERSISTED_QUERY_MAX_AGE_MS,
            buster: PERSISTED_QUERY_BUSTER,
          }
        : null,
    [tenantKey],
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
      <QueryProvider client={queryClient} persistOptions={persistOptions}>
        <AppearanceProvider>
          <OfflineRuntime />
          <OfflineChrome />
          {children}
        </AppearanceProvider>
        <Toaster />
      </QueryProvider>
    </SessionProvider>
  )
}

/**
 * Persisted for a signed-in tenant, in memory only otherwise. There is nobody
 * to keep a signed-out visitor's data for, and no tenant to key it under.
 */
function QueryProvider({
  client,
  persistOptions,
  children,
}: {
  client: QueryClient
  persistOptions: React.ComponentProps<typeof PersistQueryClientProvider>["persistOptions"] | null
  children: React.ReactNode
}) {
  if (!persistOptions) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return (
    <PersistQueryClientProvider client={client} persistOptions={persistOptions}>
      {children}
    </PersistQueryClientProvider>
  )
}
