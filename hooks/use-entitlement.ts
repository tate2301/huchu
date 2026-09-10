"use client";

import * as React from "react";
import { useSession } from "next-auth/react";

import { hasTokenFeature } from "@/lib/platform/gating/token-check";

/**
 * What this tenant is entitled to, on the client.
 *
 * The session token already carries `enabledFeatures`; `components/layout/app-sidebar.tsx`
 * has read it since the sidebar learned to hide modules nobody bought. This
 * puts the same read behind a name so a page can gate a query on it without
 * reaching into `session.user` and casting.
 *
 * ## What goes wrong without it
 *
 * A page entitled to *itself* is not entitled to everything it wants to show.
 * `/accounting/sales` and `/accounting/purchases` fill a "receive payment into"
 * picker from `/api/accounting/banking/accounts`; `/accounting/journals` fills
 * a cost-centre picker from `/api/accounting/cost-centers`. A tenant on Sales,
 * Purchases and Journals but not on Banking or Cost Centres — a payroll bureau
 * doing its own books is exactly that — took a **403 on every page load**. The
 * picker came up empty, which is the right outcome reached the wrong way: the
 * request should never have been made.
 *
 * The e2e suite caught it as console errors and it was recorded as needing
 * "a client-side entitlement signal that doesn't exist". That was wrong — this
 * is it, and the sidebar had been using it all along.
 */
export function useEnabledFeatures(): string[] | undefined {
  const { data: session } = useSession();
  return React.useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
}

/**
 * Is this feature switched on for this tenant?
 *
 * Use it as the `enabled` of a React Query that would otherwise 403:
 *
 *   const canSeeBanking = useHasFeature("accounting.banking")
 *   useQuery({ ..., enabled: canSeeBanking })
 *
 * Returns `false` while the session is still loading, which is the safe way
 * round: a request not yet made costs nothing, and one made too early costs a
 * 403 in everybody's console.
 */
export function useHasFeature(featureKey: string): boolean {
  const enabledFeatures = useEnabledFeatures();
  return hasTokenFeature(enabledFeatures, featureKey);
}
