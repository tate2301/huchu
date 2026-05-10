"use client";

import { AlertCircle, AlertTriangle, Info, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  ANOMALY_LABEL,
  type Anomaly,
  type AnomalyCode,
  type AnomalySeverity,
  type DryRunSummary,
  type LedgerEntry,
} from "../types";

const SEVERITY_TONE: Record<
  AnomalySeverity,
  { dot: string; chip: string; ring: string; row: string }
> = {
  CRITICAL: {
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-800 border-rose-200",
    ring: "ring-rose-300",
    row: "bg-rose-50/40",
  },
  WARN: {
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    ring: "ring-amber-300",
    row: "bg-amber-50/40",
  },
  INFO: {
    dot: "bg-sky-500",
    chip: "bg-sky-50 text-sky-800 border-sky-200",
    ring: "ring-sky-300",
    row: "bg-sky-50/20",
  },
};

function SeverityIcon({ severity, className }: { severity: AnomalySeverity; className?: string }) {
  if (severity === "CRITICAL") return <AlertCircle className={className} />;
  if (severity === "WARN") return <AlertTriangle className={className} />;
  return <Info className={className} />;
}

type GroupBy = "severity" | "code";

export function StudioAnomalyPanel({
  summary,
  entries,
  onJumpTo,
  onClose,
  groupBy = "severity",
  onGroupByChange,
}: {
  summary: DryRunSummary | null;
  entries: LedgerEntry[];
  onJumpTo: (entryId: string) => void;
  onClose?: () => void;
  groupBy?: GroupBy;
  onGroupByChange?: (g: GroupBy) => void;
}) {
  if (!summary || summary.anomalies.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader onClose={onClose} total={0} groupBy={groupBy} onGroupByChange={onGroupByChange} />
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-xs text-[--text-muted]">No anomalies detected</p>
        </div>
      </div>
    );
  }

  const lineByEntry = new Map(entries.map((e) => [e.id, e.lineNo] as const));

  const grouped = new Map<string, { label: string; severity: AnomalySeverity; items: Anomaly[] }>();

  if (groupBy === "severity") {
    const sevOrder: AnomalySeverity[] = ["CRITICAL", "WARN", "INFO"];
    for (const sev of sevOrder) {
      const items = summary.anomalies.filter((a) => a.severity === sev);
      if (items.length > 0) grouped.set(sev, { label: sev, severity: sev, items });
    }
  } else {
    const byCode = new Map<AnomalyCode, Anomaly[]>();
    for (const a of summary.anomalies) {
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
      grouped.set(code, { label: ANOMALY_LABEL[code], severity: items[0].severity, items });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader
        onClose={onClose}
        total={summary.anomalies.length}
        groupBy={groupBy}
        onGroupByChange={onGroupByChange}
        counts={summary.countsBySeverity}
      />
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([key, group]) => {
            const tone = SEVERITY_TONE[group.severity];
            return (
              <section key={key}>
                <h4 className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                  <SeverityIcon severity={group.severity} className="h-3 w-3" />
                  <span>{group.label}</span>
                  <span
                    className={cn(
                      "ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                      tone.chip,
                    )}
                  >
                    {group.items.length}
                  </span>
                </h4>
                <ul className="space-y-1">
                  {group.items.map((a) => (
                    <li key={`${a.entryId}:${a.code}:${a.message}`}>
                      <button
                        type="button"
                        onClick={() => onJumpTo(a.entryId)}
                        className={cn(
                          "block w-full cursor-pointer rounded border bg-[--surface-base] p-2 text-left text-[11px] transition-colors hover:bg-[--surface-muted] focus:outline-none focus-visible:ring-1",
                          tone.ring,
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
                          <span className="font-medium text-[--text-strong]">
                            {ANOMALY_LABEL[a.code]}
                          </span>
                          <span className="ml-auto font-mono text-[10px] text-[--text-muted]">
                            L{lineByEntry.get(a.entryId) ?? "?"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[--text-body]">{a.message}</p>
                        {a.suggestedFix ? (
                          <p className="mt-0.5 text-[10px] italic text-[--text-muted]">
                            Fix: {a.suggestedFix}
                          </p>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  onClose,
  total,
  groupBy,
  onGroupByChange,
  counts,
}: {
  onClose?: () => void;
  total: number;
  groupBy: GroupBy;
  onGroupByChange?: (g: GroupBy) => void;
  counts?: Record<AnomalySeverity, number>;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-[--border] px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
          Anomalies
          {total > 0 && (
            <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
              {total}
            </span>
          )}
        </span>
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
      {counts && (
        <div className="flex gap-1.5">
          {counts.CRITICAL > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-800">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
              {counts.CRITICAL} crit
            </span>
          )}
          {counts.WARN > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
              {counts.WARN} warn
            </span>
          )}
          {counts.INFO > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden />
              {counts.INFO} info
            </span>
          )}
        </div>
      )}
      {onGroupByChange && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[--text-muted]">Group by</span>
          {(["severity", "code"] as GroupBy[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGroupByChange(g)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
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
    </div>
  );
}
