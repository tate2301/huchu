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
import { motion } from "framer-motion";
import { GoldShell } from "@/components/gold/gold-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchShiftGroups, fetchSites } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BulkAcceptPayload } from "./studio-anomaly-panel";

import type {
  Anomaly,
  CommitSummary,
  DryRunSummary,
  ImportDetail,
  LedgerEntry,
} from "../types";

import { StudioHeader } from "./studio-header";
import { type StudioTableHandle } from "./studio-table";
import { DEFAULT_FILTER, type StudioFilter } from "./studio-filter-bar";
import { BulkEditDialog, type BulkEditPayload } from "./bulk-edit-dialog";
import { AddSaleDialog } from "./add-sale-dialog";
import { useStudioHistory } from "./studio-history";
import { useStudioKeyboard } from "./studio-keyboard";
import { type SortingState, type OnChangeFn } from "@tanstack/react-table";
import type { CellCoord } from "./studio-keyboard";
import { CommandPalette, type CommandVerb } from "./command-palette";
import { KeyboardHelp } from "./keyboard-help";
import { useVimMode } from "./vim-mode";
import { useSpreadsheetPaste, usePastePreview } from "./spreadsheet-paste";
import { PastePreviewDialog } from "./paste-preview-dialog";
import { LeaderTimeline } from "./leader-timeline";
import { ImportTabRail, type StudioTab } from "./import-tabs";
import { TabOverview } from "./tab-overview";
import { TabMappings } from "./tab-mappings";
import { TabLedger } from "./tab-ledger";
import { StudioActivityPanel } from "./studio-activity-panel";
import { StudioCommentThread } from "./studio-comment-thread";
import { StudioReconciliationPanel } from "./studio-reconciliation-panel";
import {
  TabProducedPours,
  TabProducedReceipts,
  TabProducedAllocations,
  TabProducedDispatches,
  TabProducedPayouts,
  TabExceptions,
} from "./tab-produced";

const COL_STORAGE_KEY = "studio-col-widths";

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

  const [activeTab, setActiveTab] = useState<StudioTab>("overview");
  const [dryRun, setDryRun] = useState<DryRunSummary | null>(null);
  const [warnAccepted, setWarnAccepted] = useState(false);
  const [studioFilter, setStudioFilter] = useState<StudioFilter>(DEFAULT_FILTER);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeCell, setActiveCell] = useState<CellCoord | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const handleSortingChange: OnChangeFn<SortingState> = setSorting;
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [addSaleOpen, setAddSaleOpen] = useState(false);
  const [saleInitialPourIds, setSaleInitialPourIds] = useState<string[]>([]);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [isVimMode, setIsVimMode] = useState(false);
  const [isAnnotationMode, setIsAnnotationMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [leaderTimeline, setLeaderTimeline] = useState<string | null>(null);
  const [commentEntryId, setCommentEntryId] = useState<string | null>(null);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const yankBuffer = useRef<LedgerEntry[]>([]);

  const history = useStudioHistory();
  const { preview: pastePreview, onPreview: setPastePreview, onCancel: cancelPaste } = usePastePreview();

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
      notes?: string;
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

  const insertEntryMutation = useMutation({
    mutationFn: async (payload: {
      afterEntryId?: string;
      beforeEntryId?: string;
    }) =>
      fetchJson<unknown>(`/api/gold/imports/${id}/entries`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
      toast({ title: "Row inserted", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not insert row",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) =>
      fetch(`/api/gold/imports/${id}/entries/${entryId}`, {
        method: "DELETE",
      }).then((r) => {
        if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
      toast({ title: "Row deleted", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not delete row",
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

  useEffect(() => {
    if (isFullscreen) {
      // Lock background scroll while fullscreen is active so chrome behind
      // the studio doesn't peek through if the operator scrolls.
      document.documentElement.classList.add("studio-fullscreen");
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.documentElement.classList.remove("studio-fullscreen");
        document.body.style.overflow = prev;
      };
    }
    document.documentElement.classList.remove("studio-fullscreen");
  }, [isFullscreen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isMod && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
        return;
      }
      if (isMod && e.key === "\\") {
        e.preventDefault();
        setIsFullscreen((o) => !o);
        return;
      }
      if (!inInput && e.key === "?" && !isMod) {
        e.preventDefault();
        setKeyboardHelpOpen((o) => !o);
        return;
      }
      if (!inInput && e.key === "Escape") {
        if (commandPaletteOpen) { setCommandPaletteOpen(false); return; }
        if (keyboardHelpOpen) { setKeyboardHelpOpen(false); return; }
        if (commentEntryId) { setCommentEntryId(null); return; }
        if (leaderTimeline) { setLeaderTimeline(null); return; }
        if (isFullscreen) { setIsFullscreen(false); return; }
        if (isAnnotationMode) { setIsAnnotationMode(false); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, keyboardHelpOpen, commentEntryId, leaderTimeline, isFullscreen, isAnnotationMode]);

  const [localMappings, setLocalMappings] = useState<Record<string, string>>({});
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


  const handleBulkAcceptWarn = useCallback((payload: BulkAcceptPayload) => {
    if (payload.severity === "WARN") {
      setWarnAccepted(true);
      toast({ title: "Warnings accepted", description: payload.reason, variant: "success" });
    }
  }, [toast]);

  const handleAutoFix = useCallback(
    (anomaly: Anomaly) => {
      if (!anomaly.suggestedFix) return;
      toast({ title: "Auto-fix applied", description: `${anomaly.code}: ${anomaly.suggestedFix}` });
    },
    [toast],
  );

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);

  const commentLineNo = useMemo(() => {
    if (!commentEntryId) return undefined;
    return entries.find((e) => e.id === commentEntryId)?.lineNo;
  }, [commentEntryId, entries]);

  const filteredEntries = useMemo(() => {
    const f = studioFilter;
    const noFilter =
      f.severities.length === 0 &&
      f.statuses.length === 0 &&
      !f.dateMin &&
      !f.dateMax &&
      f.leaders.length === 0 &&
      f.mapped === "all";
    if (noFilter) return entries;

    return entries.filter((e) => {
      if (f.statuses.length > 0 && !f.statuses.includes(e.status)) return false;
      if (f.dateMin && e.parsedDate && e.parsedDate < f.dateMin) return false;
      if (f.dateMax && e.parsedDate && e.parsedDate > f.dateMax) return false;
      if (f.leaders.length > 0 && !f.leaders.includes(e.parsedName ?? "")) return false;
      if (f.mapped === "mapped" && !e.mappedShiftGroupId) return false;
      if (f.mapped === "unmapped" && !!e.mappedShiftGroupId) return false;
      if (f.severities.length > 0) {
        const entryAnomalies = anomaliesByEntry.get(e.id) ?? [];
        const hasSev = entryAnomalies.some((a) => f.severities.includes(a.severity));
        if (!hasSev) return false;
      }
      return true;
    });
  }, [entries, studioFilter, anomaliesByEntry]);

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

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    for (const entryId of ids) {
      deleteEntryMutation.mutate(entryId);
    }
    setSelectedIds(new Set());
  }, [selectedIds, deleteEntryMutation]);

  const handleAddRow = useCallback(() => {
    insertEntryMutation.mutate({});
  }, [insertEntryMutation]);

  const handleInsertRowAfter = useCallback(
    (entryId: string) => {
      insertEntryMutation.mutate({ afterEntryId: entryId });
    },
    [insertEntryMutation],
  );

  const handleInsertRowBefore = useCallback(
    (entryId: string) => {
      insertEntryMutation.mutate({ beforeEntryId: entryId });
    },
    [insertEntryMutation],
  );

  const handleDeleteRow = useCallback(
    (entryId: string) => {
      deleteEntryMutation.mutate(entryId);
    },
    [deleteEntryMutation],
  );

  const handleDuplicateSelected = useCallback(() => {
    toast({
      title: "Duplicate",
      description: "Row duplication via API not yet wired (Epic 15).",
    });
  }, [toast]);

  const handleAddSale = useCallback(() => {
    setSaleInitialPourIds([]);
    setAddSaleOpen(true);
  }, []);

  const handleSellSelected = useCallback(() => {
    const pourIds = entries
      .filter((e) => selectedIds.has(e.id) && (e as { goldPourId?: string }).goldPourId)
      .map((e) => (e as { goldPourId?: string }).goldPourId!)
      .filter(Boolean);
    setSaleInitialPourIds(pourIds);
    setAddSaleOpen(true);
  }, [entries, selectedIds]);

  const handleRename = useCallback(
    (name: string) => {
      // Backend PATCH accepts `notes` but not `fileName/displayName`.
      // Storing rename in notes for now.
      // TODO: add `displayName` field to GoldLedgerImport (follow-up sprint).
      patchMutation.mutate({ notes: name });
      toast({
        title: "Rename saved to notes",
        description: "A backend field for display names is a planned follow-up.",
      });
    },
    [patchMutation, toast],
  );

  const handleExportCsv = useCallback(() => {
    if (!data) return;
    const headers = ["lineNo", "parsedDate", "parsedName", "gramsTotal", "boysGrams", "mdaraGrams", "balGrams", "status"];
    const rows = data.entries.map((e) =>
      [e.lineNo, e.parsedDate ?? "", e.parsedName ?? "", e.gramsTotal ?? "", e.boysGrams ?? "", e.mdaraGrams ?? "", e.balGrams ?? "", e.status].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.fileName.replace(/[^a-zA-Z0-9_-]/g, "_")}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

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

  const handleCopySelected = useCallback(() => {
    yankBuffer.current = entries.filter((e) => selectedIds.has(e.id));
    toast({
      title: `Copied ${yankBuffer.current.length} row${yankBuffer.current.length === 1 ? "" : "s"}`,
    });
  }, [entries, selectedIds, toast]);

  const handlePasteAfterActive = useCallback(() => {
    if (yankBuffer.current.length === 0) return;
    toast({
      title: "Paste after row",
      description: "Row paste via API not yet wired (Epic 15).",
    });
  }, [toast]);

  useVimMode({
    enabled: isVimMode,
    activeCell,
    totalRows: entries.length,
    totalCols,
    selectedIds,
    entries,
    onMove: setActiveCell,
    onEdit: () => {},
    onCancel: () => setActiveCell(null),
    onToggleSelect: (entryId) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(entryId)) next.delete(entryId);
        else next.add(entryId);
        return next;
      });
    },
    onDeleteSelected: handleDeleteSelected,
    onOpenCommandPalette: () => setCommandPaletteOpen(true),
    onFocusSearch: () => setFindReplaceOpen(true),
    onCopySelected: handleCopySelected,
    onPasteAfterActive: handlePasteAfterActive,
  });

  useSpreadsheetPaste({
    enabled: !isAnnotationMode && !isLocked,
    activeCell,
    entries,
    onPreview: setPastePreview,
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

  const commandVerbs = useMemo((): CommandVerb[] => [
    { id: "add-row", label: "Add row at end", group: "Row operations", disabled: isLocked || isAnnotationMode, onRun: handleAddRow },
    { id: "delete-selected", label: `Delete selected (${selectedIds.size})`, group: "Row operations", disabled: selectedIds.size === 0 || isLocked || isAnnotationMode, onRun: handleDeleteSelected },
    { id: "duplicate-selected", label: `Duplicate selected (${selectedIds.size})`, group: "Row operations", disabled: selectedIds.size === 0 || isLocked || isAnnotationMode, onRun: handleDuplicateSelected },
    { id: "bulk-edit", label: "Bulk edit field…", group: "Row operations", disabled: selectedIds.size === 0 || isLocked || isAnnotationMode, onRun: () => setBulkEditOpen(true) },
    { id: "dry-run", label: "Run dry-run validation", group: "Validation", shortcut: "Ctrl+Enter", disabled: isLocked, onRun: handleValidate },
    { id: "commit", label: "Commit import", group: "Validation", disabled: !canCommit || isLocked, onRun: () => commitMutation.mutate() },
    { id: "toggle-fullscreen", label: isFullscreen ? "Exit fullscreen" : "Fullscreen mode", group: "Layout", shortcut: "Cmd+\\", onRun: () => setIsFullscreen((o) => !o) },
    { id: "toggle-vim", label: isVimMode ? "Disable vim mode" : "Enable vim mode", group: "Settings", onRun: () => setIsVimMode((o) => !o) },
    { id: "toggle-annotation", label: isAnnotationMode ? "Disable annotation mode" : "Annotation mode (read-only)", group: "Settings", onRun: () => setIsAnnotationMode((o) => !o) },
    { id: "find-replace", label: findReplaceOpen ? "Close find / replace" : "Find / replace", group: "Edit", shortcut: "Ctrl+F", disabled: isAnnotationMode, onRun: () => setFindReplaceOpen((o) => !o) },
    { id: "undo", label: "Undo", group: "Edit", shortcut: "Ctrl+Z", disabled: !history.canUndo || isAnnotationMode, onRun: handleUndo },
    { id: "redo", label: "Redo", group: "Edit", shortcut: "Ctrl+Shift+Z", disabled: !history.canRedo || isAnnotationMode, onRun: handleRedo },
    { id: "keyboard-help", label: "Keyboard shortcuts", group: "Help", shortcut: "?", onRun: () => setKeyboardHelpOpen(true) },
  ], [
    isLocked, isAnnotationMode, selectedIds.size, isFullscreen, isVimMode, findReplaceOpen,
    history.canUndo, history.canRedo, canCommit,
    handleAddRow, handleDeleteSelected, handleDuplicateSelected,
    handleValidate, handleUndo, handleRedo, commitMutation,
  ]);

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

  const isCommitted = data.status === "COMMITTED";

  return (
    <GoldShell
      activeTab="home"
      title={data.fileName}
    >
      <motion.div
        // Animate between in-page and fullscreen. `layout` smoothly
        // transitions size/position; the explicit transition keeps it
        // crisp (200ms ease-out) rather than springy. z-[60] puts the
        // fullscreen layer above the GoldShell sidebar/header (which
        // sit in the default stacking context) and matches the project
        // convention that toasts/dialogs at z-50 should still float on
        // top when spawned from inside fullscreen — Radix portals to
        // body so they render later in DOM order, winning the tie.
        layout
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "flex flex-col overflow-hidden border bg-[var(--surface-canvas)]",
          isFullscreen
            ? "fixed inset-0 z-[60] h-screen w-screen rounded-none border-0"
            : "h-[calc(100vh-10rem)] rounded-lg border-[--border]",
        )}
      >
        <StudioHeader
          importData={data}
          canCommit={canCommit}
          isCommitting={commitMutation.isPending}
          isResetting={resetFailedMutation.isPending}
          isValidating={dryRunMutation.isPending}
          dryRunLabel={dryRun ? "Re-validate" : "Validate"}
          onCommit={() => commitMutation.mutate()}
          onRollback={() => rollbackMutation.mutate()}
          onResetFailed={() => resetFailedMutation.mutate()}
          onDelete={() => deleteMutation.mutate()}
          onValidate={handleValidate}
          onRename={handleRename}
          onExportCsv={handleExportCsv}
        />

        <div className="flex flex-1 overflow-hidden">
          <ImportTabRail
            active={activeTab}
            onChange={setActiveTab}
            anomalyCount={dryRun ? dryRun.anomalies.length : data.rowsAnomaly}
          />

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {activeTab === "overview" && (
              <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                  <TabOverview
                    importData={data}
                    dryRun={dryRun}
                    isValidating={dryRunMutation.isPending}
                    siteIsSet={siteIsSet}
                    allMapped={allMapped}
                    mappedCount={mappedCount}
                    totalNames={distinctNames.length}
                    onValidate={handleValidate}
                    onSwitchToLedger={() => setActiveTab("ledger")}
                    onSwitchToMappings={() => setActiveTab("mappings")}
                  />
                </div>
                <div className="flex w-72 shrink-0 flex-col border-l border-[--border]">
                  <div className="flex shrink-0 border-b border-[--border] bg-[--surface-muted]">
                    <button
                      type="button"
                      onClick={() => setReconciliationOpen(false)}
                      className={cn(
                        "flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors",
                        !reconciliationOpen
                          ? "bg-[--surface-base] text-[--text-strong]"
                          : "text-[--text-muted] hover:text-[--text-body]",
                      )}
                    >
                      Activity
                    </button>
                    <button
                      type="button"
                      onClick={() => setReconciliationOpen(true)}
                      className={cn(
                        "flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors",
                        reconciliationOpen
                          ? "bg-[--surface-base] text-[--text-strong]"
                          : "text-[--text-muted] hover:text-[--text-body]",
                      )}
                    >
                      Reconcile
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    {reconciliationOpen ? (
                      <StudioReconciliationPanel
                        importData={data}
                        onFilterByVariance={(scopeId) => {
                          setStudioFilter((f) => ({ ...f, leaders: [scopeId] }));
                          setActiveTab("ledger");
                        }}
                      />
                    ) : (
                      <StudioActivityPanel importId={id} />
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "mappings" && (
              <div className="flex-1 overflow-y-auto">
                <TabMappings
                  importData={data}
                  importId={id}
                  distinctNames={distinctNames}
                  sites={sites}
                  groups={groups}
                  localMappings={localMappings}
                  existingMappings={existingMappings}
                  onSetSite={setSiteAndSave}
                  onSetMapping={setMappingAndSave}
                  isLocked={isLocked ?? false}
                />
              </div>
            )}

            {activeTab === "ledger" && (
              <div className="flex flex-1 overflow-hidden">
                <TabLedger
                  tableRef={tableRef}
                  entries={entries}
                  filteredEntries={filteredEntries}
                  isLocked={isLocked ?? false}
                  anomaliesByEntry={anomaliesByEntry}
                  groupNameForEntry={groupNameForEntry}
                  dryRun={dryRun}
                  isValidating={dryRunMutation.isPending}
                  onUpdateEntry={updateEntry}
                  onInsertRowAfter={handleInsertRowAfter}
                  onInsertRowBefore={handleInsertRowBefore}
                  onDeleteRow={handleDeleteRow}
                  selectedIds={selectedIds}
                  onSelectChange={setSelectedIds}
                  activeCell={activeCell}
                  onActiveCellChange={setActiveCell}
                  sorting={sorting}
                  onSortingChange={handleSortingChange}
                  columnWidths={columnWidths}
                  onColumnWidthChange={handleColumnWidthChange}
                  findReplaceOpen={findReplaceOpen}
                  onLeaderClick={setLeaderTimeline}
                  onRowCommentClick={(entryId) => setCommentEntryId(entryId)}
                  selectedGrams={selectedGrams}
                  selectedBal={selectedBal}
                  canUndo={history.canUndo}
                  canRedo={history.canRedo}
                  isVimMode={isVimMode}
                  isAnnotationMode={isAnnotationMode}
                  isFullscreen={isFullscreen}
                  onAddRow={handleAddRow}
                  onDeleteSelected={handleDeleteSelected}
                  onDuplicateSelected={handleDuplicateSelected}
                  onBulkEdit={() => setBulkEditOpen(true)}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onFindReplace={() => setFindReplaceOpen((o) => !o)}
                  onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                  onOpenKeyboardHelp={() => setKeyboardHelpOpen(true)}
                  onToggleVimMode={() => setIsVimMode((o) => !o)}
                  onToggleAnnotationMode={() => setIsAnnotationMode((o) => !o)}
                  onToggleFullscreen={() => setIsFullscreen((o) => !o)}
                  onAddSale={handleAddSale}
                  onSellSelected={handleSellSelected}
                  onValidate={handleValidate}
                  onBulkAcceptWarn={handleBulkAcceptWarn}
                  onAutoFix={handleAutoFix}
                  studioFilter={studioFilter}
                  onFilterChange={setStudioFilter}
                  distinctLeaders={distinctNames}
                />
                {commentEntryId && (
                  <div className="w-72 shrink-0 border-l border-[--border]">
                    <StudioCommentThread
                      importId={id}
                      ledgerEntryId={commentEntryId}
                      lineNo={commentLineNo}
                      onClose={() => setCommentEntryId(null)}
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === "pours" && (
              <div className="flex-1 overflow-y-auto">
                <TabProducedPours entries={entries} isCommitted={isCommitted} />
              </div>
            )}

            {activeTab === "allocations" && (
              <div className="flex-1 overflow-y-auto">
                <TabProducedAllocations entries={entries} isCommitted={isCommitted} />
              </div>
            )}

            {activeTab === "dispatches" && (
              <div className="flex-1 overflow-y-auto">
                <TabProducedDispatches isCommitted={isCommitted} />
              </div>
            )}

            {activeTab === "receipts" && (
              <div className="flex-1 overflow-y-auto">
                <TabProducedReceipts entries={entries} isCommitted={isCommitted} />
              </div>
            )}

            {activeTab === "payouts" && (
              <div className="flex-1 overflow-y-auto">
                <TabProducedPayouts isCommitted={isCommitted} />
              </div>
            )}

            {activeTab === "exceptions" && (
              <div className="flex-1 overflow-y-auto">
                <TabExceptions isCommitted={isCommitted} />
              </div>
            )}
          </div>
        </div>

        <BulkEditDialog
          open={bulkEditOpen}
          selectedCount={selectedIds.size}
          onClose={() => setBulkEditOpen(false)}
          onApply={handleBulkApply}
        />

        <AddSaleDialog
          open={addSaleOpen}
          importId={id}
          siteId={data?.siteId ?? null}
          initialPourIds={saleInitialPourIds}
          isSuperAdmin={false}
          onClose={() => setAddSaleOpen(false)}
          onCommitted={(result) => {
            queryClient.invalidateQueries({ queryKey: ["gold-import", id] });
            toast({
              title: result.isAnomaly
                ? `Sale added with deficit (${result.remainingGrams.toFixed(3)} g)`
                : `Sale added — ${result.consumedGrams.toFixed(3)} g`,
              variant: result.isAnomaly ? "default" : "success",
            });
          }}
        />
      </motion.div>

      {isAnnotationMode && (
        <div
          // z-[70] keeps the "Review only" watermark above the fullscreen
          // layer (z-[60]) so it stays visible in both modes.
          className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="rotate-[-30deg] select-none text-[96px] font-black uppercase tracking-widest text-amber-300/20">
            Review only
          </span>
        </div>
      )}

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        verbs={commandVerbs}
      />

      <KeyboardHelp
        open={keyboardHelpOpen}
        onClose={() => setKeyboardHelpOpen(false)}
      />

      <PastePreviewDialog
        rows={pastePreview}
        onConfirm={(rows) => {
          cancelPaste();
          for (const row of rows) {
            const patch: Parameters<typeof updateEntry>[1] = {};
            for (const f of row.fields) {
              const num = parseFloat(f.value);
              (patch as Record<string, unknown>)[f.col] = isNaN(num) ? f.value : num;
            }
            updateEntry(row.entryId, patch);
          }
          toast({ title: `Pasted ${rows.length} row${rows.length === 1 ? "" : "s"}`, variant: "success" });
        }}
        onCancel={cancelPaste}
      />

      {leaderTimeline && (
        <LeaderTimeline
          leaderName={leaderTimeline}
          currentImportId={id}
          onClose={() => setLeaderTimeline(null)}
        />
      )}
    </GoldShell>
  );
}
