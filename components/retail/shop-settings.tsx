"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { fetchJson } from "@/lib/api-client";
import type { RetailSetupSnapshot } from "@/lib/retail/setup-snapshot";

export const SHOP_SETUP_KEY = ["retail-setup-overview"] as const;

/** The shop's setup, read once for every Shop page and the rail beside them. */
export function useShopSetup() {
  return useQuery({
    queryKey: SHOP_SETUP_KEY,
    queryFn: () => fetchJson<RetailSetupSnapshot>("/api/v2/retail/setup/overview"),
  });
}

/**
 * Which Shop rows the rail marks with its amber dot.
 *
 * This is what the old setup overview was for — a checklist page of tiles and a
 * coverage chart. The rail already has a way to say "this needs you", so the
 * checklist is the rail.
 */
const ATTENTION_BY_SECTION: Record<string, string> = {
  operations: "retail-tills",
  policy: "retail-till-rules",
  accounting: "retail-posting",
};

/**
 * The settings surface, for a Shop page: the rail's counts and attention dots
 * filled from the shop's setup.
 */
export function ShopSettingsShell({ children }: { children: React.ReactNode }) {
  const setup = useShopSetup();
  const snapshot = setup.data;

  const railAttention = React.useMemo(
    () =>
      (snapshot?.sections ?? [])
        .filter((section) => section.missing > 0)
        .map((section) => ATTENTION_BY_SECTION[section.id])
        .filter((id): id is string => Boolean(id)),
    [snapshot],
  );

  return (
    <PreferencesShell
      railCounts={snapshot ? { "retail-tills": snapshot.registers.length } : undefined}
      railAttention={railAttention}
    >
      {children}
    </PreferencesShell>
  );
}
