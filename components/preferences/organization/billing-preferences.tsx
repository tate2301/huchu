"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Empty, Kit } from "@/components/core";
import { OwnsChrome } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchBillingPreferences } from "@/lib/preferences/api";

import { BillingPageView } from "./billing-view";
import { ChangePlanDialog } from "./change-plan-dialog";

/**
 * Management → Billing on the workspace's subscription. Taking an add-on is
 * arranged with Corelith: Add opens the plan and its prices, as changing the
 * plan did.
 */
export function BillingPreferences() {
  const [planOpen, setPlanOpen] = React.useState(false);
  const query = useQuery({ queryKey: ["preferences", "billing"], queryFn: fetchBillingPreferences });

  return (
    <PreferencesShell>
      <OwnsChrome>
        {query.data ? (
          <BillingPageView data={query.data} onAddOn={() => setPlanOpen(true)} />
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
      <ChangePlanDialog open={planOpen} onOpenChange={setPlanOpen} />
    </PreferencesShell>
  );
}
