"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Info, Search, X, Sparkles, Check } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  ANOMALY_LABEL,
  type Anomaly,
  type AnomalyCode,
  type AnomalySeverity,
  type DryRunSummary,
  type LedgerEntry,
} from "../types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SEVERITY_TONE: Record<
  AnomalySeverity,
  { dot: string; chip: string; ring: string; row: string; toggle: string; focusRing: string }
> = {
  CRITICAL: {
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-800 border-rose-200",
    ring: "ring-rose-300",
    row: "bg-rose-50/40",
    toggle: "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100",
    focusRing: "ring-2 ring-rose-400",
  },
  WARN: {
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    ring: "ring-amber-300",
    row: "bg-amber-50/40",
    toggle: "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
    focusRing: "ring-2 ring-amber-400",
  },
  INFO: {
    dot: "bg-sky-500",
    chip: "bg-sky-50 text-sky-800 border-sky-200",
    ring: "ring-sky-300",
    row: "bg-sky-50/20",
    toggle: "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100",
    focusRing: "ring-2 ring-sky-400",
  },
};

const CODES_WITH_AUTO_FIX: AnomalyCode[] = ["UNMAPPED_LEADER", "FAILED_PARSE"];

function SeverityIcon({ severity, className }: { severity: AnomalySeverity; className?: string }) {
  if (severity === "CRITICAL") return <AlertCircle className={className} />;
  if (severity === "WARN") return <AlertTriangle className={className} />;
  return <Info className={className} />;
}

type GroupBy = "severity" | "code" | "leader" | "date";

export type BulkAcceptPayload = {
  severity: AnomalySeverity;
  reason: string;
};

export function StudioAnomalyPanel({
  summary,
  entries,
  onJumpTo,
  onClose,
  groupBy = "severity",
  onGroupByChange,
  onBulkAccept,
  onAutoFix,
}: {
  summary: DryRunSummary | null;
  entries: LedgerEntry[];
  onJumpTo: (entryId: string) => void;
  onClose?: () => void;
  groupBy?: GroupBy;
  onGroupByChange?: (g: GroupBy) => void;
  onBulkAccept?: (payload: BulkAcceptPayload) => void;
  onAutoFix?: (anomaly: Anomaly) => void;
}) {
  const [severityFilter, setSeverityFilter] = useState<Set<AnomalySeverity>>(
    new Set(["CRITICAL", "WARN", "INFO"]),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkAcceptOpen, setBulkAcceptOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const toggleSeverity = useCallback((sev: AnomalySeverity) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) {
        if (next.size === 1) return prev;
        next.delete(sev);
      } else {
        next.add(sev);
      }
      return next;
    });
  }, []);

  const filteredAnomalies = useMemo(() => {
    if (!summary) return [];
    return summary.anomalies.filter((a) => {
      if (!severityFilter.has(a.severity)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const label = ANOMALY_LABEL[a.code].toLowerCase();
        const msg = a.message.toLowerCase();
        const entry = entries.find((e) => e.id === a.entryId);
        const name = entry?.parsedName?.toLowerCase() ?? "";
        if (!label.includes(q) && !msg.includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [summary, severityFilter, searchQuery, entries]);

  // Flat list of all anomalies in render order, for keyboard nav
  const flatList = useMemo(() => filteredAnomalies, [filteredAnomalies]);

  const lineByEntry = useMemo(() => new Map(entries.map((e) => [e.id, e.lineNo] as const)), [entries]);
  const nameByEntry = useMemo(() => new Map(entries.map((e) => [e.id, e.parsedName] as const)), [entries]);

  const grouped = useMemo(() => {
    const result = new Map<string, { label: string; severity: AnomalySeverity; items: Anomaly[] }>();

    if (groupBy === "severity") {
      const sevOrder: AnomalySeverity[] = ["CRITICAL", "WARN", "INFO"];
      for (const sev of sevOrder) {
        const items = filteredAnomalies.filter((a) => a.severity === sev);
        if (items.length > 0) result.set(sev, { label: sev, severity: sev, items });
      }
    } else if (groupBy === "code") {
      const byCode = new Map<AnomalyCode, Anomaly[]>();
      for (const a of filteredAnomalies) {
        const list = byCode.get(a.code) ?? [];
        list.push(a);
        byCode.set(a.code, list);
      }
      const orderedCodes = Array.from(byCode.keys()).sort((a, b) => {
        const aSev = byCode.get(a)![0].severity;
        const bSev = byCode.get(b)![0].severity;
        const ord: Record<AnomalySeverity, number> = { CRITICAL: 0, WARN: 1, INFO: 2 };
        if (ord[aSev] !== ord[bSev]) return ord[aSev] - ord[bSev];
        return ANOMALY_LABEL[a].localeCompare(ANOMALY_LABEL[b]);
      });
      for (const code of orderedCodes) {
        const items = byCode.get(code)!;
        result.set(code, { label: ANOMALY_LABEL[code], severity: items[0].severity, items });
      }
    } else if (groupBy === "leader") {
      const byLeader = new Map<string, Anomaly[]>();
      for (const a of filteredAnomalies) {
        const name = nameByEntry.get(a.entryId) ?? "(unnamed)";
        const list = byLeader.get(name) ?? [];
        list.push(a);
        byLeader.set(name, list);
      }
      for (const [name, items] of byLeader) {
        const worstSev = items.some((a) => a.severity === "CRITICAL")
          ? "CRITICAL"
          : items.some((a) => a.severity === "WARN")
            ? "WARN"
            : "INFO";
        result.set(name, { label: name, severity: worstSev, items });
      }
    } else {
      const byDate = new Map<string, Anomaly[]>();
      for (const a of filteredAnomalies) {
        const entry = entries.find((e) => e.id === a.entryId);
        const date = entry?.parsedDate ? entry.parsedDate.slice(0, 10) : "(no date)";
        const list = byDate.get(date) ?? [];
        list.push(a);
        byDate.set(date, list);
      }
      const sorted = Array.from(byDate.keys()).sort();
      for (const date of sorted) {
        const items = byDate.get(date)!;
        const worstSev = items.some((a) => a.severity === "CRITICAL")
          ? "CRITICAL"
          : items.some((a) => a.severity === "WARN")
            ? "WARN"
            : "INFO";
        result.set(date, { label: date, severity: worstSev, items });
      }
    }

    return result;
  }, [groupBy, filteredAnomalies, entries, nameByEntry]);

  // Reset focus when list changes
  useEffect(() => {
    setFocusedIdx(-1);
  }, [filteredAnomalies.length, searchQuery]);

  // Keyboard navigation: j/k to move, Enter to jump, f to accept, / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inSearch = target === searchRef.current;

      if (e.key === "/" && !inSearch) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (inSearch) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, flatList.length - 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && focusedIdx >= 0 && focusedIdx < flatList.length) {
        e.preventDefault();
        onJumpTo(flatList[focusedIdx].entryId);
        return;
      }
      if (e.key === "f" && focusedIdx >= 0 && focusedIdx < flatList.length) {
        e.preventDefault();
        const a = flatList[focusedIdx];
        if (CODES_WITH_AUTO_FIX.includes(a.code) && a.suggestedFix && onAutoFix) {
          onAutoFix(a);
        }
        return;
      }
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    };

    const container = listRef.current;
    container?.addEventListener("keydown", handler);
    return () => container?.removeEventListener("keydown", handler);
  }, [flatList, focusedIdx, onJumpTo, onAutoFix, onClose]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIdx < 0) return;
    const el = listRef.current?.querySelector(`[data-anomaly-idx="${focusedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx]);

  const warnCount = summary?.countsBySeverity.WARN ?? 0;
  const total = filteredAnomalies.length;

  if (!summary || summary.anomalies.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader
          onClose={onClose}
          total={0}
          groupBy={groupBy}
          onGroupByChange={onGroupByChange}
          counts={summary?.countsBySeverity}
          severityFilter={severityFilter}
          onToggleSeverity={toggleSeverity}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchRef={searchRef}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
          <Check className="h-5 w-5 text-emerald-500" />
          <p className="text-xs font-medium text-[--text-strong]">No anomalies detected</p>
          <p className="text-[11px] text-[--text-muted]">Run validation again after editing rows.</p>
        </div>
      </div>
    );
  }

  // Build flat index across all groups for keyboard nav display
  let globalIdx = 0;
  const groupsWithIndex: Array<{
    key: string;
    label: string;
    severity: AnomalySeverity;
    items: Array<{ anomaly: Anomaly; idx: number }>;
  }> = [];
  for (const [key, group] of grouped.entries()) {
    const items = group.items.map((a) => ({ anomaly: a, idx: globalIdx++ }));
    groupsWithIndex.push({ key, label: group.label, severity: group.severity, items });
  }

  return (
    <div
      ref={listRef}
      tabIndex={-1}
      className="flex h-full flex-col overflow-hidden outline-none"
    >
      <PanelHeader
        onClose={onClose}
        total={total}
        groupBy={groupBy}
        onGroupByChange={onGroupByChange}
        counts={summary.countsBySeverity}
        severityFilter={severityFilter}
        onToggleSeverity={toggleSeverity}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchRef={searchRef}
      />

      {/* Keyboard hint bar */}
      <div className="shrink-0 flex items-center gap-3 border-b border-[--border] bg-[--surface-muted] px-3 py-1">
        <KbdHint keys={["j", "k"]} label="navigate" />
        <KbdHint keys={["↵"]} label="jump to row" />
        <KbdHint keys={["f"]} label="auto-fix" />
        <KbdHint keys={["/"]} label="search" />
        {focusedIdx >= 0 && (
          <span className="ml-auto font-mono text-[10px] tabular-nums text-[--text-muted]">
            {focusedIdx + 1} / {flatList.length}
          </span>
        )}
      </div>

      {warnCount > 0 && onBulkAccept && (
        <div className="shrink-0 border-b border-[--border] px-3 py-1.5">
          <button
            type="button"
            onClick={() => setBulkAcceptOpen(true)}
            className="flex w-full items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
          >
            <Check className="h-3 w-3" />
            Accept all {warnCount} warn as-is
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {total === 0 ? (
          <p className="py-6 text-center text-xs text-[--text-muted]">
            No anomalies match the current filters
          </p>
        ) : (
          <div className="space-y-3">
            {groupsWithIndex.map((group) => {
              const tone = SEVERITY_TONE[group.severity];
              return (
                <section key={group.key}>
                  <h4 className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                    <SeverityIcon severity={group.severity} className="h-3 w-3" />
                    <span className="truncate">{group.label}</span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                        tone.chip,
                      )}
                    >
                      {group.items.length}
                    </span>
                  </h4>
                  <ul className="space-y-1">
                    {group.items.map(({ anomaly: a, idx }) => (
                      <AnomalyItem
                        key={`${a.entryId}:${a.code}:${a.message}`}
                        anomaly={a}
                        tone={tone}
                        lineNo={lineByEntry.get(a.entryId)}
                        isFocused={focusedIdx === idx}
                        dataIdx={idx}
                        onFocus={() => setFocusedIdx(idx)}
                        onJumpTo={onJumpTo}
                        onAutoFix={
                          CODES_WITH_AUTO_FIX.includes(a.code) && a.suggestedFix && onAutoFix
                            ? () => onAutoFix(a)
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={bulkAcceptOpen} onOpenChange={(o) => !o && setBulkAcceptOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept all {warnCount} warnings as-is?</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a mandatory reason. This will be recorded in the import audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            <textarea
              className="w-full rounded border border-[--border] bg-[--surface-base] px-3 py-2 text-sm text-[--text-strong] placeholder:text-[--text-muted] focus:outline-none focus:ring-1 focus:ring-amber-400"
              placeholder="Reason for accepting…"
              rows={3}
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setBulkAcceptOpen(false); setBulkReason(""); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!bulkReason.trim()}
              onClick={() => {
                if (!bulkReason.trim()) return;
                onBulkAccept?.({ severity: "WARN", reason: bulkReason.trim() });
                setBulkAcceptOpen(false);
                setBulkReason("");
              }}
            >
              Accept all warnings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KbdHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-[--text-muted]">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border border-[--border] bg-[--surface-base] px-0.5 font-mono text-[9px] text-[--text-muted]"
        >
          {k}
        </kbd>
      ))}
      <span className="ml-0.5">{label}</span>
    </span>
  );
}

function AnomalyItem({
  anomaly,
  tone,
  lineNo,
  isFocused,
  dataIdx,
  onFocus,
  onJumpTo,
  onAutoFix,
}: {
  anomaly: Anomaly;
  tone: (typeof SEVERITY_TONE)[AnomalySeverity];
  lineNo: number | undefined;
  isFocused: boolean;
  dataIdx: number;
  onFocus: () => void;
  onJumpTo: (entryId: string) => void;
  onAutoFix?: () => void;
}) {
  return (
    <li data-anomaly-idx={dataIdx}>
      <button
        type="button"
        onMouseEnter={onFocus}
        onClick={() => onJumpTo(anomaly.entryId)}
        className={cn(
          "block w-full cursor-pointer rounded border bg-[--surface-base] p-2 text-left text-[11px] transition-colors hover:bg-[--surface-muted] focus:outline-none focus-visible:ring-1",
          isFocused ? cn(tone.focusRing, "bg-[--surface-muted]") : tone.ring,
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
          <span className="font-medium text-[--text-strong]">
            {ANOMALY_LABEL[anomaly.code]}
          </span>
          <span className="ml-auto font-mono tabular-nums text-[10px] text-[--text-muted]">
            L{lineNo ?? "?"}
          </span>
          {isFocused && (
            <span className="text-[10px] text-[--text-muted]" aria-hidden>↵</span>
          )}
        </div>
        <p className="mt-0.5 text-[--text-body]">{anomaly.message}</p>
        {anomaly.suggestedFix && (
          <p className="mt-0.5 text-[10px] italic text-[--text-muted]">
            Suggested: {anomaly.suggestedFix}
          </p>
        )}
      </button>
      {onAutoFix && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAutoFix(); }}
          title="Auto-fix this anomaly (f)"
          className="mt-0.5 flex w-full items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <Sparkles className="h-2.5 w-2.5" />
          Auto-fix
          <span className="ml-auto text-[9px] opacity-60">f</span>
        </button>
      )}
    </li>
  );
}

function PanelHeader({
  onClose,
  total,
  groupBy,
  onGroupByChange,
  counts,
  severityFilter,
  onToggleSeverity,
  searchQuery,
  onSearchChange,
  searchRef,
}: {
  onClose?: () => void;
  total: number;
  groupBy: GroupBy;
  onGroupByChange?: (g: GroupBy) => void;
  counts?: Record<AnomalySeverity, number>;
  severityFilter: Set<AnomalySeverity>;
  onToggleSeverity: (sev: AnomalySeverity) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-[--border] px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
          Anomalies
          {total > 0 && (
            <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-rose-800">
              {total}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {onGroupByChange && (
            <div className="flex items-center gap-0.5">
              {(["severity", "code", "leader", "date"] as GroupBy[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onGroupByChange(g)}
                  title={`Group by ${g}`}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    groupBy === g
                      ? "bg-[--action-secondary-bg] text-[--action-primary-bg]"
                      : "text-[--text-muted] hover:text-[--text-body]",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-0.5 text-[--text-muted] hover:text-[--text-strong]"
              aria-label="Close anomaly panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {counts && (
        <div className="flex flex-wrap gap-1">
          {(["CRITICAL", "WARN", "INFO"] as AnomalySeverity[]).map((sev) => {
            if (!counts[sev]) return null;
            const tone = SEVERITY_TONE[sev];
            const active = severityFilter.has(sev);
            return (
              <button
                key={sev}
                type="button"
                onClick={() => onToggleSeverity(sev)}
                title={`${active ? "Hide" : "Show"} ${sev.toLowerCase()} anomalies`}
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-opacity",
                  active ? tone.toggle : "border-[--border] bg-[--surface-base] text-[--text-muted] opacity-50",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", active ? tone.dot : "bg-[--text-muted]")} aria-hidden />
                {counts[sev]} {sev.toLowerCase()}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[--text-muted]" />
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search anomalies… (/)"
          className="w-full rounded border border-[--border] bg-[--surface-base] py-1 pl-6 pr-2 text-[11px] text-[--text-strong] placeholder:text-[--text-muted] focus:outline-none focus:ring-1 focus:ring-[--ring]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[--text-muted] hover:text-[--text-strong]"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

