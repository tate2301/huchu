"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty, Kit } from "@/components/core";
import { OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { ExploreSettingsView } from "@/lib/explore/settings";

import { ExploreSettingsPageView } from "./explore-settings-view";

const QUERY_KEY = ["explore", "settings"] as const;

/** Management → Explore: who can use it (changed here), what each product shows, the guards, and the questions run. */
export default function ExploreManagementPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => fetchJson<ExploreSettingsView>("/api/explore/settings") });
  const roles = useMutation({
    mutationFn: (next: string[]) => fetchJson<ExploreSettingsView>("/api/explore/settings", { method: "PATCH", body: JSON.stringify({ roles: next }) }),
    onMutate: async (next) => {
      await client.cancelQueries({ queryKey: QUERY_KEY });
      const before = client.getQueryData<ExploreSettingsView>(QUERY_KEY);
      if (before) client.setQueryData<ExploreSettingsView>(QUERY_KEY, { ...before, roles: before.roles.map((row) => ({ ...row, canUse: row.fixed || next.includes(row.role) })) });
      return { before };
    },
    onSuccess: (view) => {
      client.setQueryData(QUERY_KEY, view);
      void client.invalidateQueries({ queryKey: ["explore", "catalog"] });
      toast({ title: "Who can use Explore changed" });
    },
    onError: (error, _next, context) => {
      if (context?.before) client.setQueryData(QUERY_KEY, context.before);
      toast({ title: "Who can use Explore did not change", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });
  return (
    <ManagementShell>
      <OwnsChrome>
        {query.data ? (
          <ExploreSettingsPageView data={query.data} saving={roles.isPending} onRoles={(next) => roles.mutate(next)} />
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
