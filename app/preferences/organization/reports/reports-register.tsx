"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Switch } from "@corelithzw/react";
import { RecordActivityTrail } from "@/components/activity/record-activity-trail";
import {
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RegisterLayout,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
} from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowLeft, FileCheck, SlidersHorizontal, TableRows } from "@/lib/icons";
import type { ReportSettingSummary } from "@/lib/reports/types";

import {
  DetailGrid,
  DetailRow,
  DetailValue,
  NoRecord,
} from "@/app/management/master-data/operations/_components/register-fields";

const QUERY_KEY = ["reports", "settings"] as const;
const FULL_LOG_HREF = "/preferences/organization/activity";

type SettingsResponse = { areas: Array<{ area: string; reports: ReportSettingSummary[] }> };

/**
 * Reports, in management: which reports this workspace offers, and how each
 * one opens.
 *
 * The list is every report the workspace has — the ones about modules it was
 * provisioned with — in the order the catalogue shows them. A report is on
 * until somebody switches it off here. Its page is arranged on the report
 * itself (`/reports/<key>/arrange`), where its own rows are there to arrange
 * against, and everyone's starting view is saved from the report the same way:
 * set it up as it should open, then make it the starting view.
 */
export function ReportsRegister() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchJson<SettingsResponse>("/api/v2/reports/settings"),
  });

  const all = React.useMemo(() => (query.data?.areas ?? []).flatMap((area) => area.reports), [query.data]);
  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((row) => row.title.toLowerCase().includes(needle) || row.area.toLowerCase().includes(needle));
  }, [all, search]);

  const wide = useWideViewport();
  React.useEffect(() => {
    if (!wide) return;
    if (selectedKey && rows.some((row) => row.key === selectedKey)) return;
    setSelectedKey(rows[0]?.key ?? null);
  }, [rows, selectedKey, wide]);

  const selected = rows.find((row) => row.key === selectedKey) ?? null;

  const save = useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: Record<string, unknown> }) =>
      fetchJson(`/api/v2/reports/${encodeURIComponent(key)}/settings`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["reports", "catalog"] });
    },
    onError: (error) =>
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const state: ListColumnState = query.isLoading
    ? "loading"
    : query.isError
      ? "failed"
      : rows.length > 0
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  const offered = all.filter((row) => row.enabled).length;

  return (
    <PreferencesShell railCounts={{ reports: offered }}>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="Reports"
            noun="report"
            count={all.length}
            state={state}
            columns={{ row: "Report", value: "Offered" }}
            search={{ value: search, onChange: setSearch, placeholder: "Report or area" }}
            emptyLabel="No reports for this workspace"
            onRetry={() => void query.refetch()}
          >
            {rows.map((row) => (
              <ListRow
                key={row.key}
                name={row.title}
                value={row.enabled ? "On" : "Off"}
                selected={row.key === selectedKey}
                onSelect={() => setSelectedKey(row.key)}
                // A report nobody is offered reads muted, as a retired record does.
                className={row.enabled ? undefined : "[&_*]:text-[#5E6573]"}
              />
            ))}
          </ListColumn>
        }
      >
        {selected ? (
          <>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="mb-3 hidden items-center gap-2 text-[13px] font-medium leading-[1.4] text-[#565C69] max-[899px]:inline-flex"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Reports
            </button>

            <RecordHeader
              title={selected.title}
              icon={FileCheck}
              badge={
                selected.enabled ? undefined : (
                  <StatusBadge context="header" tone="neutral">
                    Off
                  </StatusBadge>
                )
              }
              action={
                <HeaderAction icon={SlidersHorizontal} onClick={() => router.push(`/reports/${selected.key}/arrange`)}>
                  Arrange the page
                </HeaderAction>
              }
              overflow={
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/reports/${selected.key}`}>Open the report</Link>
                  </DropdownMenuItem>
                  {selected.arranged ? (
                    <DropdownMenuItem onSelect={() => save.mutate({ key: selected.key, patch: { layout: null } })}>
                      Go back to the report&apos;s own page
                    </DropdownMenuItem>
                  ) : null}
                  {selected.viewSaved ? (
                    <DropdownMenuItem onSelect={() => save.mutate({ key: selected.key, patch: { view: null } })}>
                      Clear the starting view
                    </DropdownMenuItem>
                  ) : null}
                </>
              }
            />

            <SectionHeading icon={TableRows} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              <DetailRow label="Offered">
                {(id) => (
                  <Switch
                    id={id}
                    checked={selected.enabled}
                    disabled={save.isPending}
                    onChange={(event) => save.mutate({ key: selected.key, patch: { enabled: event.target.checked } })}
                  />
                )}
              </DetailRow>
              <DetailRow label="Area">
                <DetailValue>{selected.area}</DetailValue>
              </DetailRow>
              <DetailRow label="Page">
                <DetailValue>{selected.arranged ? "Arranged for this workspace" : "The report's own"}</DetailValue>
              </DetailRow>
              <DetailRow label="Starting view">
                <DetailValue>{selected.viewSaved ? "Saved for this workspace" : "The report's own"}</DetailValue>
              </DetailRow>
            </DetailGrid>

            <RecordActivityTrail entityType="ReportSetting" entityId={selected.settingId} fullLogHref={FULL_LOG_HREF} />
          </>
        ) : (
          <NoRecord label={state === "ready" ? "Choose a report" : "No report chosen"} />
        )}
      </RegisterLayout>
    </PreferencesShell>
  );
}

/** Below 900px the register shows one column at a time, as the other registers do. */
function useWideViewport() {
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return wide;
}
