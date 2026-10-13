"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty, Kit } from "@/components/core";
import { useWorkspaceName } from "@/components/layout/shell-nav";
import { ReportsSettingsPageView, type ReportsSettingsPatch } from "@/components/management/reports-settings-view";
import { OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { ReportSettingSummary } from "@/lib/reports/types";

const QUERY_KEY = ["reports", "settings"] as const;

type SettingsResponse = { areas: Array<{ area: string; reports: ReportSettingSummary[] }> };

/** Management → Reports (PageReportsSettings), on the reports this workspace has and what it changed. */
export function ReportsSettings() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const workspace = useWorkspaceName();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => fetchJson<SettingsResponse>("/api/v2/reports/settings") });
  const rows = React.useMemo(() => (query.data?.areas ?? []).flatMap((area) => area.reports), [query.data]);

  const save = useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: ReportsSettingsPatch }) =>
      fetchJson(`/api/v2/reports/${encodeURIComponent(key)}/settings`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["reports", "catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (error) => toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  return (
    <ManagementShell railCounts={{ reports: rows.filter((row) => row.enabled).length }}>
      <OwnsChrome>
        {query.data ? (
          <ReportsSettingsPageView
            rows={rows}
            workspace={workspace ?? "this workspace"}
            saving={save.isPending}
            onChange={(key, patch) => save.mutate({ key, patch })}
            onArrange={(key) => router.push(`/reports/${key}/arrange`)}
          />
        ) : (
          <Kit className="kit-col">
            {query.isError ? (
              <Empty
                icon="warn"
                title="Reports did not load"
                action={
                  <Button icon="history" onClick={() => void query.refetch()}>
                    Try again
                  </Button>
                }
              >
                {getApiErrorMessage(query.error, "Only managers set up reports. Ask one if this should be yours.")}
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
