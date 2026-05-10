"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GoldShell } from "@/components/gold/gold-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchShiftGroups, fetchSites, type Site } from "@/lib/api";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import { cn } from "@/lib/utils";
import { PanelLeft, SidebarLeft } from "@/lib/icons";

import type {
  Anomaly,
  CommitSummary,
  DryRunSummary,
  ImportDetail,
  LedgerEntry,
} from "../types";

import { StudioHeader } from "./studio-header";
import { StudioToolbar, FindReplaceBar } from "./studio-toolbar";
import { StudioTable, type StudioTableHandle } from "./studio-table";
import { StudioAnomalyPanel } from "./studio-anomaly-panel";
import { StudioImportsSidebar } from "./studio-imports-sidebar";
import { BulkEditDialog, type BulkEditPayload } from "./bulk-edit-dialog";
import { useStudioHistory } from "./studio-history";
import { useStudioKeyboard } from "./studio-keyboard";
import { type SortingState, type OnChangeFn } from "@tanstack/react-table";
import type { CellCoord } from "./studio-keyboard";

const PANE_STORAGE_KEY = "studio-pane-widths";
const COL_STORAGE_KEY = "studio-col-widths";

function loadPaneWidths(): { sidebar: number; anomaly: number } {
  if (typeof window === "undefined")
    return { sidebar: 220, anomaly: 260 };
  try {
    return JSON.parse(localStorage.getItem(PANE_STORAGE_KEY) ?? "{}");
  } catch {
    return { sidebar: 220, anomaly: 260 };
  }
}

function loadColWidths(importId: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(
      localStorage.getItem(`${COL_STORAGE_KEY}-${importId}`) ?? "{}",
    );
  } catch {
    return {};
  }
}

export function ImportStudio() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tableRef = useRef<StudioTableHandle>(null);

  const [dryRun, setDryRun] = useState<DryRunSummary | null>(null);
  const [warnAccepted, setWarnAccepted] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [anomalyPanelOpen, setAnomalyPanelOpen] = useState(true);
  const [anomalyGroupBy, setAnomalyGroupBy] = useState<"severity" | "code">("severity");
  const panes = useMemo(() => loadPaneWidths(), []);
  const [sidebarW] = useState(panes.sidebar ?? 220);
  const [anomalyW] = useState(panes.anomaly ?? 260);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeCell, setActiveCell] = useState<CellCoord | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const handleSortingChange: OnChangeFn<SortingState> = setSorting;
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");

  const history = useStudioHistory();

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-import", id],
    queryFn: () => fetchJson<ImportDetail>(`/api/gold/imports/${id}`),
    enabled: !!id,
  });

  const { data: groupsData } = useQuery({
    queryKey: ["shift-groups", "import", data?.siteId],
    queryFn: () =>
      fetchShiftGroups({
        active: true,
        limit: 200,
        siteId: data?.siteId ?? undefined,
      }),
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

  const groups = useMemo(() => groupsData?.data ?? [], [groupsData?.data]);
  const sites = useMemo(() => sitesData ?? [], [sitesData]);

  useEffect(() => {
    if (id) setColumnWidths(loadColWidths(id));
  }, [id]);

  const handleColumnWidthChange = useCallback(
    (col: string, w: number) => {
      setColumnWidths((prev) => {
        const next = { ...prev, [col]: w };
        localStorage.setItem(`${COL_STORAGE_KEY}-${id}`, JSON.stringify(next));
        return next;
      });
    },
    [id],
  );

  const patchMutation = useMutation({
    mutationFn: async (payload: {
      siteId?: string;
      mappings?: Record<string, string>;
    }) =>
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
      toast({
        title: result.summary
          ? `${result.summary.allocationsCreated} allocations · ${result.summary.salesCreated} sales`
          : "Committed",
        description: "Ledger imported.",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({
        title: "Commit failed",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async () =>
      fetchJson<{
        removedAllocations: number;
        removedPours: number;
        removedReceipts: number;
      }>(`/api/gold/imports/${id}/rollback`, { method: "POST" }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
      queryClient.invalidateQueries({ queryKey: ["gold-imports"] });
      queryClient.invalidateQueries({ queryKey: ["gold-summary"] });
      toast({
        title: "Import rolled back",
        description: `Removed ${result.removedAllocations} allocations · ${result.removedPours} pours · ${result.removedReceipts} receipts.`,
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
      fetchJson<unknown>(`/api/gold/imports/${id}/entries/${input.entryId}`, {
        method: "PATCH",
        body: JSON.stringify(input.patch),
      }),
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

  const autoValidatedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (autoValidatedRef.current === data.id) return;
    if (data.status === "COMMITTED") return;
    autoValidatedRef.current = data.id;
    dryRunMutation.mutate(undefined, {
      onSuccess: (s) => {
        setDryRun(s);
        setWarnAccepted(false);
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

  const existingMappings: Record<string, string> = useMemo(
    () => (data?.mappingsJson ? JSON.parse(data.mappingsJson) : {}),
    [data?.mappingsJson],
  );

  const allMapped = distinctNames.every(
    (name) => !!(localMappings[name] || existingMappings[name]),
  );
  const siteIsSet = !!data?.siteId;
  const mappedCount = distinctNames.filter(
    (n) => !!(localMappings[n] || existingMappings[n]),
  ).length;

  const criticalCount = dryRun?.countsBySeverity.CRITICAL ?? 0;
  const warnCount = dryRun?.countsBySeverity.WARN ?? 0;
  const noCriticals = !dryRun || criticalCount === 0;
  const warnsCleared = !dryRun || warnCount === 0 || warnAccepted;
  const isLocked = data?.status === "COMMITTED";
  const canCommit =
    !isLocked && allMapped && siteIsSet && noCriticals && warnsCleared;

  const groupNameForEntry = useCallback(
    (e: LedgerEntry): string | null => {
      const mappedGroupId =
        e.parsedName != null
          ? localMappings[e.parsedName] ??
            existingMappings[e.parsedName] ??
            null
          : null;
      return (
        e.shiftGroup?.name ??
        (mappedGroupId
          ? groups.find((g) => g.id === mappedGroupId)?.name ?? null
          : null)
      );
    },
    [localMappings, existingMappings, groups],
  );

  const anomaliesByEntry = useMemo(() => {
    const map = new Map<string, Anomaly[]>();
    if (!dryRun) return map;
    for (const a of dryRun.anomalies) {
      const list = map.get(a.entryId) ?? [];
      list.push(a);
      map.set(a.entryId, list);
    }
    return map;
  }, [dryRun]);

  const updateEntry = useCallback(
    (
      entryId: string,
      patch: Parameters<typeof entryMutation.mutate>[0]["patch"],
    ) => {
      entryMutation.mutate({ entryId, patch });
    },
    [entryMutation],
  );

  const handleValidate = () => {
    dryRunMutation.mutate(undefined, {
      onSuccess: (s) => {
        setDryRun(s);
        setWarnAccepted(false);
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

  const handleJumpTo = useCallback((entryId: string) => {
    tableRef.current?.scrollToEntry(entryId);
    const el = document.getElementById(`studio-row-${entryId}`);
    if (el) el.focus();
  }, []);

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);

  const selectedGrams = useMemo(
    () =>
      entries
        .filter((e) => selectedIds.has(e.id))
        .reduce((s, e) => s + (e.gramsTotal ?? 0), 0),
    [entries, selectedIds],
  );
  const selectedBal = useMemo(
    () =>
      entries
        .filter((e) => selectedIds.has(e.id))
        .reduce((s, e) => s + (e.balGrams ?? 0), 0),
    [entries, selectedIds],
  );

  const handleUndo = useCallback(() => {
    const undone = history.undo();
    if (!undone) return;
    for (const h of undone) {
      entryMutation.mutate({
        entryId: h.entryId,
        patch: h.before as Parameters<typeof entryMutation.mutate>[0]["patch"],
      });
    }
  }, [history, entryMutation]);

  const handleRedo = useCallback(() => {
    const redone = history.redo();
    if (!redone) return;
    for (const h of redone) {
      entryMutation.mutate({
        entryId: h.entryId,
        patch: h.after as Parameters<typeof entryMutation.mutate>[0]["patch"],
      });
    }
  }, [history, entryMutation]);

  const handleBulkApply = useCallback(
    (payload: BulkEditPayload) => {
      const selected = entries.filter((e) => selectedIds.has(e.id));
      for (const e of selected) {
        updateEntry(e.id, { [payload.field]: payload.value } as Parameters<typeof updateEntry>[1]);
      }
      toast({
        title: `Set ${payload.field} on ${selected.length} rows`,
        variant: "success",
      });
    },
    [entries, selectedIds, updateEntry, toast],
  );

  const handleFindReplace = useCallback(
    (find: string, replace: string, useRegex: boolean) => {
      let count = 0;
      const pattern = useRegex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(pattern, "gi");
      for (const e of entries) {
        if (e.parsedName && re.test(e.parsedName)) {
          count++;
        }
      }
      return count;
    },
    [entries],
  );

  const handleDeleteSelected = useCallback(() => {
    toast({
      title: `Delete ${selectedIds.size} rows`,
      description: "Row deletion via API not yet wired (Epic 15).",
    });
  }, [selectedIds, toast]);

  const handleAddRow = useCallback(() => {
    toast({
      title: "Add row",
      description: "Row insertion via API not yet wired (Epic 15).",
    });
  }, [toast]);

  const handleDuplicateSelected = useCallback(() => {
    toast({
      title: "Duplicate",
      description: "Row duplication via API not yet wired (Epic 15).",
    });
  }, [toast]);

  const totalCols = 9 + 3;

  useStudioKeyboard({
    activeCell,
    totalRows: entries.length,
    totalCols,
    onMove: setActiveCell,
    onEdit: () => {},
    onCancel: () => setActiveCell(null),
    onUndo: handleUndo,
    onRedo: handleRedo,
    isEditing: false,
  });

  const setSiteAndSave = (newSiteId: string) => {
    if (!newSiteId || newSiteId === data?.siteId) return;
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

  if (isLoading) {
    return (
      <GoldShell activeTab="home" title="Loading import…">
        <Skeleton className="h-96 w-full" />
      </GoldShell>
    );
  }

  if (error || !data) {
    return (
      <GoldShell activeTab="home" title="Could not load import">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error ? getApiErrorMessage(error) : "Not found"}
          </AlertDescription>
        </Alert>
      </GoldShell>
    );
  }

  return (
    <GoldShell
      activeTab="home"
      title={data.fileName}
    >
      <div
        className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-lg border border-[--border] bg-[--surface-canvas]"
        style={{ fontFamily: "var(--font-mono, monospace)" }}
      >
        <StudioHeader
          importData={data}
          canCommit={canCommit}
          isCommitting={commitMutation.isPending}
          isRollingBack={rollbackMutation.isPending}
          isResetting={resetFailedMutation.isPending}
          isDeleting={deleteMutation.isPending}
          isValidating={dryRunMutation.isPending}
          dryRunLabel={dryRun ? "Re-validate" : "Validate"}
          onCommit={() => commitMutation.mutate()}
          onRollback={() => rollbackMutation.mutate()}
          onResetFailed={() => resetFailedMutation.mutate()}
          onDelete={() => deleteMutation.mutate()}
          onValidate={handleValidate}
          siteIsSet={siteIsSet}
          allMapped={allMapped}
          mappedCount={mappedCount}
          totalNames={distinctNames.length}
          criticalCount={criticalCount}
          warnCount={warnCount}
        />

        <div className="flex flex-1 overflow-hidden">
          {sidebarOpen ? (
            <div
              className="flex shrink-0 flex-col border-r border-[--border] bg-[--surface-base] overflow-hidden"
              style={{ width: sidebarW }}
            >
              <StudioImportsSidebar
                currentImportId={id}
                onCollapse={() => setSidebarOpen(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex w-8 shrink-0 flex-col items-center justify-center border-r border-[--border] bg-[--surface-base] py-4 text-[--text-muted] hover:text-[--text-strong]"
              title="Expand sidebar"
              aria-label="Expand imports sidebar"
            >
              <SidebarLeft className="h-4 w-4" />
            </button>
          )}

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <StudioMappingBar
              importData={data}
              distinctNames={distinctNames}
              sites={sites}
              groups={groups}
              localMappings={localMappings}
              existingMappings={existingMappings}
              onSetSite={setSiteAndSave}
              onSetMapping={setMappingAndSave}
              isLocked={isLocked ?? false}
            />

            <StudioToolbar
              selectedCount={selectedIds.size}
              selectedGrams={selectedGrams}
              selectedBal={selectedBal}
              isLocked={isLocked ?? false}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onAddRow={handleAddRow}
              onDeleteSelected={handleDeleteSelected}
              onDuplicateSelected={handleDuplicateSelected}
              onBulkEdit={() => setBulkEditOpen(true)}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onFindReplace={() => {
                setFindReplaceOpen((o) => !o);
              }}
              findReplaceOpen={findReplaceOpen}
            />

            {findReplaceOpen && (
              <FindReplaceBar
                onClose={() => {
                  setFindReplaceOpen(false);
                  setFindQuery("");
                }}
                onApply={(find, replace, regex) => {
                  setFindQuery(find);
                  return handleFindReplace(find, replace, regex);
                }}
              />
            )}

            <StudioTable
              ref={tableRef}
              entries={entries}
              isLocked={isLocked ?? false}
              anomaliesByEntry={anomaliesByEntry}
              groupNameForEntry={groupNameForEntry}
              onUpdateEntry={updateEntry}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              activeCell={activeCell}
              onActiveCellChange={setActiveCell}
              sorting={sorting}
              onSortingChange={handleSortingChange}
              columnWidths={columnWidths}
              onColumnWidthChange={handleColumnWidthChange}
              findQuery={findQuery}
            />
          </div>

          {anomalyPanelOpen ? (
            <div
              className="flex shrink-0 flex-col border-l border-[--border] bg-[--surface-base] overflow-hidden"
              style={{ width: anomalyW }}
            >
              <StudioAnomalyPanel
                summary={dryRun}
                entries={entries}
                onJumpTo={handleJumpTo}
                onClose={() => setAnomalyPanelOpen(false)}
                groupBy={anomalyGroupBy}
                onGroupByChange={setAnomalyGroupBy}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAnomalyPanelOpen(true)}
              className="flex w-8 shrink-0 flex-col items-center justify-center border-l border-[--border] bg-[--surface-base] py-4 text-[--text-muted] hover:text-[--text-strong]"
              title="Expand anomaly panel"
              aria-label="Expand anomaly panel"
            >
              <PanelLeft className="h-4 w-4 rotate-180" />
            </button>
          )}
        </div>

        <BulkEditDialog
          open={bulkEditOpen}
          selectedCount={selectedIds.size}
          onClose={() => setBulkEditOpen(false)}
          onApply={handleBulkApply}
        />
      </div>
    </GoldShell>
  );
}

type Group = { id: string; name: string };

function StudioMappingBar({
  importData,
  distinctNames,
  sites,
  groups,
  localMappings,
  existingMappings,
  onSetSite,
  onSetMapping,
  isLocked,
}: {
  importData: ImportDetail;
  distinctNames: string[];
  sites: Site[];
  groups: Group[];
  localMappings: Record<string, string>;
  existingMappings: Record<string, string>;
  onSetSite: (siteId: string) => void;
  onSetMapping: (name: string, groupId: string) => void;
  isLocked: boolean;
}) {
  return (
    <div className="shrink-0 border-b border-[--border] bg-[--surface-base] px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[--text-muted] uppercase tracking-wide">
            Site
          </span>
          <div className="w-44">
            <SearchableSelect
              options={sites.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
              value={importData.siteId ?? ""}
              onValueChange={onSetSite}
              placeholder="Pick site…"
              disabled={isLocked}
            />
          </div>
        </div>

        {distinctNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-[--text-muted] uppercase tracking-wide">
              Leaders
            </span>
            {distinctNames.map((name) => {
              const mapped =
                localMappings[name] ?? existingMappings[name] ?? null;
              return (
                <div key={name} className="flex items-center gap-1">
                  <span
                    className={cn(
                      "text-[11px] font-mono rounded px-1.5 py-0.5 border",
                      mapped
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-amber-300 bg-amber-50 text-amber-800",
                    )}
                  >
                    {name}
                  </span>
                  <span className="text-[--text-muted]">→</span>
                  <div className="w-36">
                    <SearchableSelect
                      options={groups.map((g) => ({ value: g.id, label: g.name }))}
                      value={mapped ?? ""}
                      onValueChange={(gId) => onSetMapping(name, gId)}
                      placeholder="Map group…"
                      disabled={isLocked}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
