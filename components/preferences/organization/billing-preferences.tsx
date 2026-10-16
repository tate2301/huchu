"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Empty, Kit } from "@/components/core";
import { OwnsChrome } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchBillingPreferences } from "@/lib/preferences/api";

import { BillingPageView } from "./billing-view";
import { PriceDialog } from "./price-dialog";

/**
 * Management → Billing on the workspace's subscription. Adding a vertical is
 * arranged with Corelith: Add and See prices open how the price works.
 */
export function BillingPreferences() {
  const [priceOpen, setPriceOpen] = React.useState(false);
  const query = useQuery({ queryKey: ["preferences", "billing"], queryFn: fetchBillingPreferences });

  return (
    <PreferencesShell>
      <OwnsChrome>
        {query.data ? (
          <BillingPageView data={query.data} onAskPrice={() => setPriceOpen(true)} />
        ) : (
          <Kit className="kit-col">
            {query.isError ? (
              <Empty icon="warn" title="Billing did not load">
                {getApiErrorMessage(query.error)}
              </Empty>
            ) : (
              <div className="page" aria-busy="true">
                <div className="skeleton" style={{ height: 56, maxWidth: 720 }} />
                <div className="skeleton" style={{ height: 240 }} />
              </div>
            )}
          </Kit>
        )}
      </OwnsChrome>
      {query.data ? <PriceDialog open={priceOpen} onOpenChange={setPriceOpen} charges={query.data.charges} /> : null}
    </PreferencesShell>
  );
}
