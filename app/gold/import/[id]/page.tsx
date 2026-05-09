"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GoldShell } from "@/components/gold/gold-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchShiftGroups, fetchSites } from "@/lib/api";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import { ClientDate } from "@/app/gold/components/client-date";
import { ImportActions } from "./_components/import-actions";
import { AnomalyBanner, AnomalyPanel } from "./_components/anomaly-panel";
import { ImportPreviewTable } from "./_components/import-preview-table";
import type {
  Anomaly,
  CommitSummary,
  DryRunSummary,
  ImportDetail,
  LedgerEntry,
} from "./_components/types";

export default function GoldImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [commitResult, setCommitResult] = useState<CommitSummary | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-import", id],
    queryFn: () => fetchJson<ImportDetail>(`/api/gold/imports/${id}`),
    enabled: !!id,
  });

  const { data: groupsData } = useQuery({
    queryKey: ["shift-groups", "import", data?.siteId],
    queryFn: () =>
      fetchShiftGroups({ active: true, limit: 200, siteId: data?.siteId ?? undefined }),
    enabled: !!data?.siteId,
  });

  const { data: sitesData } = useQuery({
    queryKey: ["sites", "import"],
    queryFn: fetchSites,
  });

  const distinctNames = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const e of data.entries) if (e.parsedName) set.add(e.parsedName);
    return Array.from(set).sort();
  }, [data]);

  const groups = groupsData?.data ?? [];
  const sites = sitesData ?? [];

  const patchMutation = useMutation({
    mutationFn: async (payload: { siteId?: string; mappings?: Record<string, string> }) =>
      fetchJson<ImportDetail>(`/api/gold/imports/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
    },
    onError: (err) => {
      toast({
        title: "Could not save",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () =>
      fetchJson<ImportDetail & { summary?: CommitSummary }>(
        `/api/gold/imports/${id}/commit`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
      queryClient.invalidateQueries({ queryKey: ["gold-imports"] });
      queryClient.invalidateQueries({ queryKey: ["gold-summary"] });
      if (result.summary) setCommitResult(result.summary);
      toast({
        title: result.summary
          ? `${result.summary.allocationsCreated} allocations · ${result.summary.salesCreated} sales`
          : "Committed",
        description: "Ledger imported.",
        variant: "success",
      });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async () =>
      fetchJson<{ removedAllocations: number; removedPours: number; removedReceipts: number }>(
        `/api/gold/imports/${id}/rollback`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
      queryClient.invalidateQueries({ queryKey: ["gold-imports"] });
      queryClient.invalidateQueries({ queryKey: ["gold-summary"] });
      setCommitResult(null);
      toast({
        title: "Import rolled back",
        description: `Removed ${result.removedAllocations} allocations · ${result.removedPours} pours · ${result.removedReceipts} receipts. Edit & re-commit when ready.`,
        variant: "success",
      });
    },
    onError: (err) => {
      toast({
        title: "Rollback failed",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const resetFailedMutation = useMutation({
    mutationFn: async () =>
      fetchJson<{ resetCount: number }>(
        `/api/gold/imports/${id}/reset-failed`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
      toast({
        title: `Reset ${result.resetCount} failed row${result.resetCount === 1 ? "" : "s"}`,
        description: "They're back to PENDING. Hit Commit to retry just those.",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not reset",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () =>
      fetchJson(`/api/gold/imports/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gold-imports"] });
      toast({ title: "Import deleted", variant: "success" });
      router.push("/gold/import");
    },
    onError: (err) => {
      toast({
        title: "Could not delete",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const entryMutation = useMutation({
    mutationFn: async (input: {
      entryId: string;
      patch: {
        parsedDate?: string | null;
        gramsTotal?: number | null;
        expensePatch?: { type: string; weight: number | null };
        boysGrams?: number | null;
        mdaraGrams?: number | null;
        balGrams?: number | null;
      };
    }) =>
      fetchJson<unknown>(
        `/api/gold/imports/${id}/entries/${input.entryId}`,
        {
          method: "PATCH",
          body: JSON.stringify(input.patch),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
    },
    onError: (err) => {
      toast({
        title: "Could not save change",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const dryRunMutation = useMutation({
    mutationFn: async () =>
      fetchJson<DryRunSummary>(`/api/gold/imports/${id}/dry-run`, {
        method: "POST",
      }),
  });

  const [dryRun, setDryRun] = useState<DryRunSummary | null>(null);
  const [warnAccepted, setWarnAccepted] = useState(false);
  const [warnReason, setWarnReason] = useState("");

  // Re-run dry-run automatically once the import is loaded — gives the
  // user immediate feedback without an extra click.
  const autoValidatedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (autoValidatedRef.current === data.id) return;
    if (data.status === "COMMITTED") return;
    autoValidatedRef.current = data.id;
    dryRunMutation.mutate(undefined, {
      onSuccess: (s) => {
        setDryRun(s);
        // Reset acceptance whenever we re-validate.
        setWarnAccepted(false);
        setWarnReason("");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  const [localMappings, setLocalMappings] = useState<Record<string, string>>(
    {},
  );
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!data) return;
    const serverMappings: Record<string, string> = data.mappingsJson
      ? JSON.parse(data.mappingsJson)
      : {};
    setLocalMappings((prev) => {
      const merged: Record<string, string> = { ...serverMappings };
      for (const [k, v] of Object.entries(prev)) {
        if (!merged[k]) merged[k] = v;
      }
      return merged;
    });
  }, [data?.mappingsJson, data]);
  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, []);

  if (isLoading) {
    return (
      <GoldShell activeTab="home" title="Loading import...">
        <Skeleton className="h-96 w-full" />
      </GoldShell>
    );
  }
  if (error || !data) {
    return (
      <GoldShell activeTab="home" title="Could not load import">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error ? getApiErrorMessage(error) : "Not found"}</AlertDescription>
        </Alert>
      </GoldShell>
    );
  }

  const isLocked = data.status === "COMMITTED";
  const existingMappings: Record<string, string> = data.mappingsJson
    ? JSON.parse(data.mappingsJson)
    : {};
  const allMapped = distinctNames.every(
    (name) => !!(localMappings[name] || existingMappings[name]),
  );
  const siteIsSet = !!data.siteId;
  const mappedCount = distinctNames.filter(
    (n) => !!(localMappings[n] || existingMappings[n]),
  ).length;

  const criticalCount = dryRun?.countsBySeverity.CRITICAL ?? 0;
  const warnCount = dryRun?.countsBySeverity.WARN ?? 0;
  const noCriticals = !dryRun || criticalCount === 0;
  const warnsCleared = !dryRun || warnCount === 0 || warnAccepted;
  const canCommit =
    !isLocked && allMapped && siteIsSet && noCriticals && warnsCleared;

  const setSiteAndSave = (newSiteId: string) => {
    if (!newSiteId || newSiteId === data.siteId) return;
    patchMutation.mutate({ siteId: newSiteId });
  };

  const setMappingAndSave = (name: string, shiftGroupId: string) => {
    if (!shiftGroupId) return;
    if (localMappings[name] === shiftGroupId) return;
    const nextMappings = { ...localMappings, [name]: shiftGroupId };
    setLocalMappings(nextMappings);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      patchMutation.mutate({ mappings: nextMappings });
    }, 350);
  };

  const updateEntry = (
    entryId: string,
    patch: Parameters<typeof entryMutation.mutate>[0]["patch"],
  ) => {
    entryMutation.mutate({ entryId, patch });
  };

  const groupNameForEntry = (e: LedgerEntry): string | null => {
    const mappedGroupId =
      e.parsedName != null
        ? localMappings[e.parsedName] ?? existingMappings[e.parsedName] ?? null
        : null;
    return (
      e.shiftGroup?.name ??
      (mappedGroupId
        ? groups.find((g) => g.id === mappedGroupId)?.name ?? null
        : null)
    );
  };

  const anomaliesByEntry = (() => {
    const map = new Map<string, Anomaly[]>();
    if (!dryRun) return map;
    for (const a of dryRun.anomalies) {
      const list = map.get(a.entryId) ?? [];
      list.push(a);
      map.set(a.entryId, list);
    }
    return map;
  })();

  const handleJumpTo = (entryId: string) => {
    const el = document.getElementById(`ledger-row-${entryId}`);
    if (el)
      el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleValidate = () => {
    dryRunMutation.mutate(undefined, {
      onSuccess: (s) => {
        setDryRun(s);
        setWarnAccepted(false);
        setWarnReason("");
        toast({
          title: "Validation complete",
          description: `${s.countsBySeverity.CRITICAL} critical · ${s.countsBySeverity.WARN} warn · ${s.countsBySeverity.INFO} info`,
        });
      },
      onError: (err) => {
        toast({
          title: "Validation failed",
          description: getApiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  };

  return (
    <GoldShell
      activeTab="home"
      title={`Ledger: ${data.fileName}`}
      actions={
        <ImportActions
          status={data.status}
          rowsFailed={data.rowsFailed}
          canCommit={canCommit}
          isCommitting={commitMutation.isPending}
          isRollingBack={rollbackMutation.isPending}
          isResetting={resetFailedMutation.isPending}
          isDeleting={deleteMutation.isPending}
          isValidating={dryRunMutation.isPending}
          onCommit={() => commitMutation.mutate()}
          onRollback={() => rollbackMutation.mutate()}
          onResetFailed={() => resetFailedMutation.mutate()}
          onDelete={() => deleteMutation.mutate()}
          onValidate={handleValidate}
          validateLabel={dryRun ? "Re-validate" : "Validate"}
        />
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
            <StatusChip
              status={
                data.status === "COMMITTED"
                  ? "passing"
                  : data.status === "FAILED"
                    ? "danger"
                    : "warning"
              }
              label={data.status}
            />
            <span className="text-sm text-muted-foreground">
              {data.rowsTotal} rows · {data.rowsCreated} created ·{" "}
              {data.rowsAnomaly} flagged · {data.rowsFailed} failed
            </span>
            <span className="text-sm text-muted-foreground">
              Uploaded by {data.uploadedBy?.name ?? "—"} on{" "}
              <ClientDate value={data.createdAt} />
            </span>
          </div>

          <ol className="flex flex-wrap gap-2 text-xs">
            <li
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                siteIsSet
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-amber-500 bg-amber-50 text-amber-700"
              }`}
            >
              <span className="font-bold">1</span>
              <span>Site {siteIsSet ? "OK" : "needed"}</span>
            </li>
            <li
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                allMapped
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-amber-500 bg-amber-50 text-amber-700"
              }`}
            >
              <span className="font-bold">2</span>
              <span>
                Mappings ({mappedCount}/{distinctNames.length})
              </span>
            </li>
            <li
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                isLocked
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : noCriticals && warnsCleared
                    ? canCommit
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-muted text-muted-foreground"
                    : "border-rose-500 bg-rose-50 text-rose-700"
              }`}
            >
              <span className="font-bold">3</span>
              <span>
                {isLocked
                  ? "Committed"
                  : !noCriticals
                    ? `${criticalCount} critical to fix`
                    : !warnsCleared
                      ? `${warnCount} warning${warnCount === 1 ? "" : "s"} to accept`
                      : canCommit
                        ? "Ready to commit"
                        : "Commit"}
              </span>
            </li>
          </ol>

          {commitMutation.error ? (
            <Alert variant="destructive">
              <AlertTitle>Commit failed</AlertTitle>
              <AlertDescription>{getApiErrorMessage(commitMutation.error)}</AlertDescription>
            </Alert>
          ) : null}

          {!isLocked ? (
            <AnomalyBanner
              summary={dryRun}
              isLoading={dryRunMutation.isPending}
              onRevalidate={handleValidate}
              onAcceptAllWarn={(reason) => {
                setWarnAccepted(true);
                setWarnReason(reason);
                toast({
                  title: "Warnings accepted",
                  description: reason,
                });
              }}
              warnAccepted={warnAccepted}
              acceptedReason={warnReason}
              canAcceptWarn={criticalCount === 0 && warnCount > 0}
            />
          ) : null}

          {(commitResult ?? data.summary) ? (
            (() => {
              const summary = commitResult ?? data.summary!;
              return (
                <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                  <header className="flex items-center justify-between gap-3 mb-3">
                    <h2 className="font-semibold text-emerald-900">
                      Commit results
                    </h2>
                    <StatusChip status="passing" label="Done" />
                  </header>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-emerald-800">Allocations</p>
                      <p className="text-lg font-semibold">
                        {summary.allocationsCreated}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-800">Auto-pours</p>
                      <p className="text-lg font-semibold">
                        {summary.poursCreated}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-800">Sales (FIFO)</p>
                      <p className="text-lg font-semibold">
                        {summary.salesCreated}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({summary.totalSaleGrams.toFixed(2)} g)
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-800">
                        Inventory deficit
                      </p>
                      <p
                        className={`text-lg font-semibold ${
                          summary.totalDeficitGrams > 0 ? "text-rose-700" : ""
                        }`}
                      >
                        {summary.totalDeficitGrams.toFixed(2)} g
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-emerald-800">
                    {summary.rowsAnomaly > 0
                      ? `${summary.rowsAnomaly} rows flagged as anomalies — see the table below.`
                      : "All rows clean."}
                    {summary.rowsFailed > 0
                      ? ` ${summary.rowsFailed} rows failed and need attention.`
                      : ""}
                  </p>
                </section>
              );
            })()
          ) : null}

          {!isLocked ? (
            <section className="rounded-lg border bg-card p-5 space-y-4">
              <header>
                <h2 className="font-semibold">1 · Pick site</h2>
                <p className="text-sm text-muted-foreground">
                  Every row in this ledger belongs to one mine site. Saved
                  instantly.
                </p>
              </header>
              <SearchableSelect
                value={data.siteId ?? undefined}
                options={sites.map((s) => ({
                  value: s.id,
                  label: s.name,
                  meta: s.code,
                }))}
                placeholder="Pick site"
                searchPlaceholder="Search sites..."
                onValueChange={(v) => v && setSiteAndSave(v)}
              />
            </section>
          ) : null}

          {!isLocked ? (
            <section className="rounded-lg border bg-card p-5 space-y-4">
              <header>
                <h2 className="font-semibold">
                  2 · Map shift leaders ({mappedCount}/{distinctNames.length})
                </h2>
                <p className="text-sm text-muted-foreground">
                  {data.siteId
                    ? "Each name maps to a shift group. Members of that group will be marked PRESENT for every shift this leader logged. Saved instantly."
                    : "Pick a site first to load shift groups."}
                </p>
              </header>

              {distinctNames.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No leader names parsed.
                </p>
              ) : (
                <ul className="divide-y">
                  {distinctNames.map((name) => {
                    const current =
                      localMappings[name] ?? existingMappings[name] ?? "";
                    const isMapped = !!current;
                    return (
                      <li
                        key={name}
                        className={`grid grid-cols-1 sm:grid-cols-[220px_1fr_24px] gap-3 py-3 items-center ${
                          isMapped ? "" : "bg-amber-50/30 -mx-5 px-5"
                        }`}
                      >
                        <span className="font-mono font-semibold">{name}</span>
                        <SearchableSelect
                          value={current || undefined}
                          options={groups.map((g) => ({
                            value: g.id,
                            label: g.name,
                            meta: g.leader?.name,
                          }))}
                          placeholder={
                            groups.length === 0
                              ? data.siteId
                                ? "No shift groups for this site"
                                : "Pick a site first"
                              : "Pick a shift group"
                          }
                          searchPlaceholder="Search groups..."
                          disabled={!data.siteId || groups.length === 0}
                          onValueChange={(v) => setMappingAndSave(name, v)}
                        />
                        {isMapped ? (
                          <span
                            className="text-emerald-600 text-lg"
                            aria-label="mapped"
                          >
                            ✓
                          </span>
                        ) : (
                          <span
                            className="text-amber-500 text-lg"
                            aria-label="needs mapping"
                          >
                            !
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}

          <section className="rounded-lg border bg-card">
            <header className="border-b px-5 py-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  {isLocked ? "Allocations & expenses" : "3 · Preview rows"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {data.entries.length} rows ·{" "}
                  <span className="text-emerald-700">CREATED</span>{" "}
                  <span className="text-amber-700">ANOMALY</span>{" "}
                  <span className="text-rose-700">FAILED</span>{" "}
                  <span className="text-muted-foreground">PENDING</span>.{" "}
                  {isLocked
                    ? "Already committed — reset the import to edit."
                    : "Click any number to edit before commit. Anomalies appear inline below each row."}
                </p>
              </div>
            </header>
            <ImportPreviewTable
              entries={data.entries}
              isLocked={isLocked}
              anomaliesByEntry={anomaliesByEntry}
              groupNameForEntry={groupNameForEntry}
              onUpdateEntry={updateEntry}
            />
          </section>
        </div>

        {!isLocked ? (
          <AnomalyPanel
            summary={dryRun}
            entries={data.entries}
            onJumpTo={handleJumpTo}
          />
        ) : null}
      </div>
    </GoldShell>
  );
}
