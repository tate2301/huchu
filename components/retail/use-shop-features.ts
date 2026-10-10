"use client";

import { useQuery } from "@tanstack/react-query";

import { settingsQueryKey } from "@/components/settings-frame/model";
import { fetchJson } from "@/lib/api-client";
import type { SettingsResponse } from "@/lib/retail/settings-pages";
import { LIQUOR_STORE } from "@/lib/retail/settings-pages/company";
import { shopFeatures, type ShopFeatures } from "@/lib/retail/shop-profile-rules";

/**
 * What kind of shop this is and which of its features are on, for any screen
 * that changes with the shop type. Read from the Shop settings page
 * (`GET /api/v2/retail/settings/company`, `retail.company` view), so a save
 * there reaches every reader through the one query.
 */
export function useShopFeatures(enabled = true): { ready: boolean; liquor: boolean; features: ShopFeatures } {
  const query = useQuery({
    queryKey: settingsQueryKey("company"),
    queryFn: () => fetchJson<SettingsResponse>("/api/v2/retail/settings/company"),
    enabled,
  });
  const values = query.data?.values ?? {};
  const liquor = values.businessType === LIQUOR_STORE;
  return {
    ready: Boolean(query.data),
    liquor,
    features: shopFeatures({
      businessType: liquor ? "LIQUOR" : "GENERAL",
      ageCheck: values.ageCheck === true,
      licenceHours: values.licenceHours === true,
      emptiesAndDeposits: values.emptiesAndDeposits === true,
      casesAndSingles: values.casesAndSingles === true,
    }),
  };
}
