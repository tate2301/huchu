"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Button, Empty, Kit } from "@/components/core";
import { OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { ExploreSettingsView } from "@/lib/explore/settings";

import { ExploreSettingsPageView } from "./explore-settings-view";

/** Management → Explore: who can use it, what each product shows, the guards, and the questions run. */
export default function ExploreManagementPage() {
  const query = useQuery({ queryKey: ["explore", "settings"], queryFn: () => fetchJson<ExploreSettingsView>("/api/explore/settings") });
  return (
    <ManagementShell>
      <OwnsChrome>
        {query.data ? (
          <ExploreSettingsPageView data={query.data} />
        ) : (
          <Kit className="kit-col">
            {query.isError ? (
              <Empty
                icon="warn"
                title="Explore's settings did not load"
                action={
                  <Button icon="history" onClick={() => query.refetch()}>
                    Try again
                  </Button>
                }
              >
                {getApiErrorMessage(query.error)}
              </Empty>
            ) : (
              <div className="page" aria-busy="true">
                <div className="skeleton" style={{ height: 56, maxWidth: 720 }} />
                <div className="skeleton" style={{ height: 240 }} />
                <div className="skeleton" style={{ height: 240 }} />
              </div>
            )}
          </Kit>
        )}
      </OwnsChrome>
    </ManagementShell>
  );
}
