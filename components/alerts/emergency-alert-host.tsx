"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Button } from "@corelithzw/react";
import type {
  EmergencyAlertItem,
  EmergencyFeedResponse,
  EmergencyWorkflowActionKey,
  WorkflowExecutionResult,
} from "@/lib/alerts/emergency-framework";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const SNOOZE_STORAGE_KEY = "huchu:emergency-alerts:snoozed-signature";

type SingleWorkflowInput = {
  item: EmergencyAlertItem;
  note?: string;
};

type BatchWorkflowInput = {
  onlyPastDays?: boolean;
  itemIds?: string[];
  note?: string;
};

type EmergencyAlertContextValue = {
  feed: EmergencyFeedResponse | null;
  isLoading: boolean;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  openEmergencyDialog: () => void;
  runSingleWorkflow: (input: SingleWorkflowInput) => Promise<void>;
  runBatchWorkflow: (input?: BatchWorkflowInput) => Promise<void>;
  runningItemId: string | null;
  isBatchRunning: boolean;
  lastResult: WorkflowExecutionResult | null;
};

const EmergencyAlertContext = React.createContext<EmergencyAlertContextValue | null>(null);

export function useEmergencyAlerts(): EmergencyAlertContextValue {
  const ctx = React.useContext(EmergencyAlertContext);
  if (!ctx) {
    return {
      feed: null,
      isLoading: false,
      dialogOpen: false,
      setDialogOpen: () => {},
      openEmergencyDialog: () => {},
      runSingleWorkflow: async () => {},
      runBatchWorkflow: async () => {},
      runningItemId: null,
      isBatchRunning: false,
      lastResult: null,
    };
  }
  return ctx;
}

function getCriticalSignature(items: EmergencyAlertItem[]): string {
  return items
    .filter((item) => item.severity === "critical")
    .map((item) => item.id)
    .sort()
    .join("|");
}

export function EmergencyAlertProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [runningItemId, setRunningItemId] = React.useState<string | null>(null);
  const [lastResult, setLastResult] = React.useState<WorkflowExecutionResult | null>(null);
  const autoOpenedSignatureRef = React.useRef<string>("");

  const query = useQuery({
    queryKey: ["alerts", "emergencies"],
    enabled: status === "authenticated",
    queryFn: () => fetchJson<EmergencyFeedResponse>("/api/alerts/emergencies"),
    staleTime: 15_000,
    refetchInterval: 45_000,
  });

  const feed = query.data ?? null;

  // Automatically open the dialog when there are critical (past unclosed day/shift) alerts
  // that have not been snoozed in this browser session.
  React.useEffect(() => {
    if (!feed || !feed.shouldPromptDialog) return;
    const signature = getCriticalSignature(feed.items);
    if (!signature) return;
    if (autoOpenedSignatureRef.current === signature) return;

    try {
      const snoozed = window.sessionStorage.getItem(SNOOZE_STORAGE_KEY);
      if (snoozed === signature) return;
    } catch {
      // Ignore storage access errors
    }

    autoOpenedSignatureRef.current = signature;
    setDialogOpen(true);
  }, [feed]);

  const invalidateRelated = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["alerts", "emergencies"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["crm", "daily-log"] });
    void queryClient.invalidateQueries({ queryKey: ["crm", "cost-entries"] });
    void queryClient.invalidateQueries({ queryKey: ["retail"] });
    void queryClient.invalidateQueries({ queryKey: ["books"] });
  }, [queryClient]);

  const singleMutation = useMutation({
    mutationFn: async ({ item, note }: SingleWorkflowInput) => {
      if (!item.workflow) throw new Error("This item does not have an automatic workflow.");
      setRunningItemId(item.id);
      return fetchJson<{ result: WorkflowExecutionResult; feed: EmergencyFeedResponse }>(
        "/api/alerts/emergencies",
        {
          method: "POST",
          body: JSON.stringify({
            mode: "single",
            actionKey: item.workflow.actionKey as EmergencyWorkflowActionKey,
            payload: item.workflow.defaultPayload,
            note,
          }),
        },
      );
    },
    onSuccess: (data) => {
      setLastResult(data.result);
      queryClient.setQueryData(["alerts", "emergencies"], data.feed);
      invalidateRelated();
      toast({
        title: "Day-close step completed",
        description: data.result.message,
      });
    },
    onError: (error) => {
      toast({
        title: "Could not complete close-day action",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
      invalidateRelated();
    },
    onSettled: () => {
      setRunningItemId(null);
    },
  });

  const batchMutation = useMutation({
    mutationFn: async (input?: BatchWorkflowInput) => {
      return fetchJson<{ result: WorkflowExecutionResult; feed: EmergencyFeedResponse }>(
        "/api/alerts/emergencies",
        {
          method: "POST",
          body: JSON.stringify({
            mode: "batch",
            onlyPastDays: input?.onlyPastDays ?? false,
            itemIds: input?.itemIds,
            note: input?.note,
          }),
        },
      );
    },
    onSuccess: (data) => {
      setLastResult(data.result);
      queryClient.setQueryData(["alerts", "emergencies"], data.feed);
      invalidateRelated();
      toast({
        title: data.result.ok ? "All selected days closed" : "Close-day workflow finished",
        description: data.result.message,
      });
    },
    onError: (error) => {
      toast({
        title: "Batch close-day workflow failed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
      invalidateRelated();
    },
  });

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setDialogOpen(nextOpen);
      if (!nextOpen && feed) {
        const signature = getCriticalSignature(feed.items);
        if (signature) {
          try {
            window.sessionStorage.setItem(SNOOZE_STORAGE_KEY, signature);
          } catch {
            // Ignore storage errors
          }
        }
      }
    },
    [feed],
  );

  const openEmergencyDialog = React.useCallback(() => {
    setLastResult(null);
    setDialogOpen(true);
  }, []);

  const runSingleWorkflow = React.useCallback(
    async (input: SingleWorkflowInput) => {
      await singleMutation.mutateAsync(input);
    },
    [singleMutation],
  );

  const runBatchWorkflow = React.useCallback(
    async (input?: BatchWorkflowInput) => {
      await batchMutation.mutateAsync(input);
    },
    [batchMutation],
  );

  const contextValue = React.useMemo<EmergencyAlertContextValue>(
    () => ({
      feed,
      isLoading: query.isLoading,
      dialogOpen,
      setDialogOpen: handleOpenChange,
      openEmergencyDialog,
      runSingleWorkflow,
      runBatchWorkflow,
      runningItemId,
      isBatchRunning: batchMutation.isPending,
      lastResult,
    }),
    [
      feed,
      query.isLoading,
      dialogOpen,
      handleOpenChange,
      openEmergencyDialog,
      runSingleWorkflow,
      runBatchWorkflow,
      runningItemId,
      batchMutation.isPending,
      lastResult,
    ],
  );

  return (
    <EmergencyAlertContext.Provider value={contextValue}>
      {children}
      <EmergencyAlertDialog />
    </EmergencyAlertContext.Provider>
  );
}

/**
 * Compact trigger button for the top header bar (`PageHeader`).
 * Shows an urgent red/amber pill when past days or shifts haven't been closed,
 * or a subtle "Close day" chip when today's shift/day is open and ready to close.
 */
export function EmergencyHeaderTrigger({ compact = false }: { compact?: boolean }) {
  const { feed, openEmergencyDialog } = useEmergencyAlerts();
  if (!feed || feed.counts.total === 0) return null;

  const { critical, total } = feed.counts;
  const isCritical = critical > 0;

  if (compact) {
    return (
      <button
        type="button"
        onClick={openEmergencyDialog}
        title={
          isCritical
            ? `${critical} overdue unclosed ${critical === 1 ? "day or shift" : "days & shifts"}`
            : `${total} open day-close ${total === 1 ? "item" : "items"}`
        }
        aria-label={
          isCritical
            ? `Urgent: ${critical} overdue unclosed day or shift`
            : `Close day (${total})`
        }
        className={cn(
          "relative flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-medium transition-colors",
          isCritical
            ? "bg-red-500/12 text-red-700 hover:bg-red-500/20 dark:bg-red-500/20 dark:text-red-300"
            : "bg-amber-500/12 text-amber-800 hover:bg-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-2 rounded-full",
            isCritical ? "animate-pulse bg-red-600 dark:bg-red-400" : "bg-amber-500",
          )}
        />
        <span className="font-mono tabular-nums">{isCritical ? critical : total}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openEmergencyDialog}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium transition-colors",
        isCritical
          ? "bg-red-500/12 text-red-700 hover:bg-red-500/20 dark:bg-red-500/20 dark:text-red-300"
          : "bg-[var(--tray)] text-[var(--ink-2)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full",
          isCritical ? "animate-pulse bg-red-600 dark:bg-red-400" : "bg-amber-500",
        )}
      />
      <span>
        {isCritical
          ? `${critical} unclosed ${critical === 1 ? "day" : "days"}`
          : `Close day (${total})`}
      </span>
    </button>
  );
}

/**
 * The global Emergency & Unclosed Day Dialog.
 * Gives direct 1-click shortcuts to go to the exact day-close page OR runs the
 * close-day workflows right inside the dialog for Retail Shifts, Retail End-of-Day,
 * Books/ZIMRA Fiscal Day, CRM Cost Tracking, and Operations Shift Reports.
 */
function EmergencyAlertDialog() {
  const router = useRouter();
  const {
    feed,
    dialogOpen,
    setDialogOpen,
    runSingleWorkflow,
    runBatchWorkflow,
    runningItemId,
    isBatchRunning,
    lastResult,
  } = useEmergencyAlerts();

  const [notesById, setNotesById] = React.useState<Record<string, string>>({});
  const [expandedNoteId, setExpandedNoteId] = React.useState<string | null>(null);

  if (!feed) return null;

  const pastItems = feed.items.filter((item) => item.isPastDay || item.severity === "critical");
  const todayItems = feed.items.filter((item) => !item.isPastDay && item.severity !== "critical");
  const actionableItems = feed.items.filter((item) => item.workflow?.canRunInPlace);
  const actionablePastItems = pastItems.filter((item) => item.workflow?.canRunInPlace);

  const handleNavigate = (href: string) => {
    setDialogOpen(false);
    router.push(href);
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent
        size="lg"
        inset={false}
        className="flex max-h-[min(46rem,calc(100dvh-2.5rem))] flex-col gap-0 overflow-hidden"
      >
        <DialogHeader className="flex-none gap-1 border-b border-[var(--border-subtle)] px-5 py-4 pr-12">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 rounded-full",
                pastItems.length > 0 ? "animate-pulse bg-red-600" : "bg-amber-500",
              )}
            />
            <DialogTitle>
              {pastItems.length > 0
                ? `${pastItems.length} past ${pastItems.length === 1 ? "day or shift hasn’t" : "days & shifts haven’t"} been closed`
                : "End-of-day closing checklist"}
            </DialogTitle>
          </div>
          <DialogDescription>
            {pastItems.length > 0
              ? "Close overdue shifts, retail trading days, fiscal days, or cost tracking logs right here, or jump straight to each closing screen."
              : "Review and close today's open shifts, takings, fiscal day, and daily cost tracking."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {lastResult ? (
            <div
              role="status"
              className={cn(
                "rounded-[8px] border px-3.5 py-2.5 text-[13px]",
                lastResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
              )}
            >
              <p className="font-medium">{lastResult.message}</p>
              {lastResult.results && lastResult.results.length > 1 ? (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] opacity-90">
                  {lastResult.results.map((entry) => (
                    <li key={entry.itemId}>
                      <span className="font-medium">{entry.title}:</span> {entry.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {feed.items.length === 0 ? (
            <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-8 text-center">
              <p className="text-[14px] font-medium text-[var(--ink)]">
                Every day and shift is closed
              </p>
              <p className="mt-1 text-[13px] text-[var(--ink-3)]">
                All retail shifts, takings, fiscal days, cost tracking logs, and shift reports are up to date.
              </p>
            </div>
          ) : null}

          {pastItems.length > 0 ? (
            <section className="space-y-2.5" aria-label="Overdue unclosed days and shifts">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Past days not closed ({pastItems.length})
                </h3>
                <span className="text-[12px] text-[var(--ink-3)]">Needs immediate attention</span>
              </div>
              <div className="space-y-2.5">
                {pastItems.map((item) => (
                  <EmergencyItemCard
                    key={item.id}
                    item={item}
                    note={notesById[item.id] ?? ""}
                    isNoteOpen={expandedNoteId === item.id}
                    onToggleNote={() =>
                      setExpandedNoteId((prev) => (prev === item.id ? null : item.id))
                    }
                    onNoteChange={(val) =>
                      setNotesById((prev) => ({ ...prev, [item.id]: val }))
                    }
                    onNavigate={handleNavigate}
                    onRunWorkflow={() =>
                      void runSingleWorkflow({
                        item,
                        note: notesById[item.id],
                      })
                    }
                    isRunning={runningItemId === item.id || isBatchRunning}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {todayItems.length > 0 ? (
            <section className="space-y-2.5" aria-label="Today's end of day items">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Open today — End of day ({todayItems.length})
                </h3>
              </div>
              <div className="space-y-2.5">
                {todayItems.map((item) => (
                  <EmergencyItemCard
                    key={item.id}
                    item={item}
                    note={notesById[item.id] ?? ""}
                    isNoteOpen={expandedNoteId === item.id}
                    onToggleNote={() =>
                      setExpandedNoteId((prev) => (prev === item.id ? null : item.id))
                    }
                    onNoteChange={(val) =>
                      setNotesById((prev) => ({ ...prev, [item.id]: val }))
                    }
                    onNavigate={handleNavigate}
                    onRunWorkflow={() =>
                      void runSingleWorkflow({
                        item,
                        note: notesById[item.id],
                      })
                    }
                    isRunning={runningItemId === item.id || isBatchRunning}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDialogOpen(false)}
          >
            {feed.items.length > 0 ? "Remind me later" : "Done"}
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {actionablePastItems.length > 1 ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isBatchRunning || Boolean(runningItemId)}
                onClick={() => void runBatchWorkflow({ onlyPastDays: true })}
              >
                {isBatchRunning
                  ? "Closing overdue days…"
                  : `Close all ${actionablePastItems.length} overdue items now`}
              </Button>
            ) : null}

            {actionableItems.length > 0 && actionablePastItems.length <= 1 ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isBatchRunning || Boolean(runningItemId)}
                onClick={() =>
                  void runBatchWorkflow({
                    onlyPastDays: actionablePastItems.length === 1,
                  })
                }
              >
                {isBatchRunning
                  ? "Running close-day workflow…"
                  : actionablePastItems.length === 1
                    ? "Close overdue day now"
                    : `Close all (${actionableItems.length}) now`}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmergencyItemCard({
  item,
  note,
  isNoteOpen,
  onToggleNote,
  onNoteChange,
  onNavigate,
  onRunWorkflow,
  isRunning,
}: {
  item: EmergencyAlertItem;
  note: string;
  isNoteOpen: boolean;
  onToggleNote: () => void;
  onNoteChange: (val: string) => void;
  onNavigate: (href: string) => void;
  onRunWorkflow: () => void;
  isRunning: boolean;
}) {
  const isCritical = item.severity === "critical";

  return (
    <div
      className={cn(
        "rounded-[8px] border p-3.5 transition-colors",
        isCritical
          ? "border-red-500/30 bg-red-500/[0.04] dark:border-red-500/35 dark:bg-red-500/[0.07]"
          : "border-[var(--border-subtle)] bg-[var(--surface)]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 font-medium",
                isCritical
                  ? "bg-red-500/15 text-red-700 dark:text-red-300"
                  : "bg-[var(--tray)] text-[var(--ink-2)]",
              )}
            >
              {item.moduleLabel}
            </span>
            <span className="font-mono text-[var(--ink-3)]">{item.dayLabel}</span>
          </div>

          <h4 className="text-[14px] font-semibold leading-snug text-[var(--ink)]">
            {item.title}
          </h4>

          <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">{item.summary}</p>
        </div>
      </div>

      {isNoteOpen && item.workflow?.notePlaceholder ? (
        <div className="mt-2.5">
          <Input
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={item.workflow.notePlaceholder}
            className="h-8 text-[13px]"
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={item.shortcut.href}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(item.shortcut.href);
            }}
            className="inline-flex h-7 items-center rounded-[6px] bg-[var(--tray)] px-2.5 text-[12px] font-medium text-[var(--ink)] no-underline hover:bg-[var(--hover)]"
          >
            {item.shortcut.label} →
          </Link>

          {item.secondaryShortcut ? (
            <Link
              href={item.secondaryShortcut.href}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(item.secondaryShortcut!.href);
              }}
              className="inline-flex h-7 items-center rounded-[6px] px-2 text-[12px] text-[var(--ink-3)] no-underline hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            >
              {item.secondaryShortcut.label}
            </Link>
          ) : null}
        </div>

        {item.workflow?.canRunInPlace ? (
          <div className="flex items-center gap-1.5">
            {item.workflow.notePlaceholder ? (
              <button
                type="button"
                onClick={onToggleNote}
                className="h-7 rounded-[6px] px-2 text-[12px] text-[var(--ink-3)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
              >
                {isNoteOpen ? "Hide note" : "+ Note"}
              </button>
            ) : null}
            <Button
              type="button"
              variant={isCritical ? "primary" : "secondary"}
              size="sm"
              disabled={isRunning}
              onClick={onRunWorkflow}
            >
              {isRunning ? "Closing…" : item.workflow.label}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
