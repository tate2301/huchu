"use client"

import { usePathname } from "next/navigation"

/**
 * True while the till is showing its sign-in screen.
 *
 * `app/portal/pos/layout.tsx` wraps every route under `/portal/pos` — the login
 * page included — in `PosPortalProvider` and `PosTillLockProvider`. Both start
 * fetching the moment they mount, so a cashier standing at a sign-in form
 * caused three unauthenticated requests before they had typed anything:
 *
 *   NAV   /portal/pos/login
 *   401   /api/v2/retail/pos/pin
 *   401   /api/v2/retail/pos/context
 *   401   /api/v2/retail/pos/current-shift
 *
 * …and again on React Query's retry, so six. All correctly refused, all
 * pointless: six round trips and a console full of red on the slowest device in
 * the shop, every time anybody signs in.
 *
 * Gating the queries on this is the small fix. The structural one is to move
 * `login` out of the till layout with a route group, which is worth doing and
 * is not a change to make while getting a test suite green.
 *
 * Matches on the suffix because the till answers to two paths:
 * `/portal/pos/login` on a tenant host, and `/login` once the POS host rewrite
 * has been applied.
 */
export function usePosSignedOut(): boolean {
  const pathname = usePathname()
  return pathname?.endsWith("/login") ?? false
}
