"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

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
 * A Management page as FND-03 moved it: inside the app shell, under the
 * Management panel, with the page header naming it from the nav. Its area unit
 * rebuilds it on the SettingsFrame.
 */
export function ShopSettingsShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">{children}</div>;
}
