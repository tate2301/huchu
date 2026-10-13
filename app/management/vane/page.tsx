"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Empty, Kit } from "@/components/core";
import { OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { VaneSettingsPatch, VaneSettingsView } from "@/lib/vane/settings";

import { VaneSettingsPageView, type VaneSettingsData } from "./vane-settings-view";

const QUERY_KEY = ["vane", "settings"] as const;

/** Management → Vane, on the workspace's own settings and this month's work. */
export default function VaneManagementPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => fetchJson<VaneSettingsData>("/api/vane/settings") });
  const save = useMutation({
    mutationFn: (patch: VaneSettingsPatch) =>
      fetchJson<VaneSettingsView>("/api/vane/settings", { method: "PATCH", body: JSON.stringify(patch) }),
    // The switch moves at once; a refusal puts it back.
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: QUERY_KEY });
      const before = client.getQueryData<VaneSettingsData>(QUERY_KEY);
      if (before) {
        client.setQueryData<VaneSettingsData>(QUERY_KEY, {
          ...before,
          settings: {
            ...before.settings,
            ...patch,
            watches: { ...before.settings.watches, ...patch.watches },
            routing: { ...before.settings.routing, ...patch.routing },
          },
        });
      }
      return { before };
    },
    onError: (error, _patch, context) => {
      if (context?.before) client.setQueryData(QUERY_KEY, context.before);
      toast({ title: "Vane's settings did not change", description: getApiErrorMessage(error), variant: "destructive" });
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["vane"] }),
  });

  return (
    <ManagementShell>
      <OwnsChrome>
      {query.data ? (
        <VaneSettingsPageView data={query.data} saving={save.isPending} onChange={(patch) => save.mutate(patch)} />
      ) : (
        <Kit className="kit-col">
          {query.isError ? (
            <Empty icon="warn" title="Vane's settings did not load">
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
    </ManagementShell>
  );
}
