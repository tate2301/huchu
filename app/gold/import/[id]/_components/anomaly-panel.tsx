"use client";

import { AlertCircle, AlertTriangle, Info } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  ANOMALY_LABEL,
  type Anomaly,
  type AnomalyCode,
  type AnomalySeverity,
  type DryRunSummary,
  type LedgerEntry,
} from "./types";

const SEVERITY_TONE: Record<
  AnomalySeverity,
  { dot: string; chip: string; ring: string }
> = {
  CRITICAL: {
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-800 border-rose-200",
    ring: "ring-rose-300",
  },
  WARN: {
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    ring: "ring-amber-300",
  },
  INFO: {
    dot: "bg-sky-500",
    chip: "bg-sky-50 text-sky-800 border-sky-200",
    ring: "ring-sky-300",
  },
};

function SeverityIcon({
  severity,
  className,
}: {
  severity: AnomalySeverity;
  className?: string;
}) {
  if (severity === "CRITICAL") return <AlertCircle className={className} />;
  if (severity === "WARN") return <AlertTriangle className={className} />;
  return <Info className={className} />;
}

export function AnomalyBanner({
  summary,
  isLoading,
  onRevalidate,
  onAcceptAllWarn,
  warnAccepted,
  acceptedReason,
  canAcceptWarn,
}: {
  summary: DryRunSummary | null;
  isLoading: boolean;
  onRevalidate: () => void;
  onAcceptAllWarn: (reason: string) => void;
  warnAccepted: boolean;
  acceptedReason: string;
  canAcceptWarn: boolean;
}) {
  if (!summary && !isLoading) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground">
            No validation pass yet. Run the validator to predict
            anomalies before commit.
          </p>
          <button
            type="button"
            onClick={onRevalidate}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Run validation
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
        Running validation pass…
      </div>
    );
  }

  const counts = summary!.countsBySeverity;
  const total = counts.CRITICAL + counts.WARN + counts.INFO;
  const allClear = total === 0;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-sm",
        allClear
          ? "border-emerald-300 bg-emerald-50/60"
          : counts.CRITICAL > 0
            ? "border-rose-300 bg-rose-50/60"
            : "border-amber-300 bg-amber-50/60",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">
            {allClear
              ? "All clear — no anomalies predicted."
              : `${total} ${total === 1 ? "anomaly" : "anomalies"} predicted`}
          </h3>
          {!allClear ? (
            <div className="flex items-center gap-2 text-xs">
              {counts.CRITICAL > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 font-medium text-rose-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                  {counts.CRITICAL} critical
                </span>
              ) : null}
              {counts.WARN > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                  {counts.WARN} warning
                </span>
              ) : null}
              {counts.INFO > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 font-medium text-sky-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />
                  {counts.INFO} info
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRevalidate}
          className="rounded-md border border-foreground/20 bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          Re-run validation
        </button>
      </div>

      {!allClear && counts.CRITICAL === 0 && counts.WARN > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-100/60 px-3 py-2">
          {warnAccepted ? (
            <p className="text-xs text-amber-900">
              Warnings accepted{acceptedReason ? `: "${acceptedReason}"` : ""}.
              Commit unblocked.
            </p>
          ) : (
            <AcceptWarnInline
              disabled={!canAcceptWarn}
              onAccept={onAcceptAllWarn}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function AcceptWarnInline({
  onAccept,
  disabled,
}: {
  onAccept: (reason: string) => void;
  disabled?: boolean;
}) {
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const reason = String(data.get("reason") ?? "").trim();
        if (reason.length === 0) return;
        onAccept(reason);
      }}
    >
      <label className="text-xs text-amber-900">
        Why is it OK to ship these warnings?
      </label>
      <input
        name="reason"
        required
        minLength={3}
        placeholder="e.g. spot-checked source ledger, rounding"
        className="min-w-[18rem] rounded border border-amber-300 bg-background px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-amber-700 px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        Accept all warnings
      </button>
    </form>
  );
}

export function AnomalyPanel({
  summary,
  entries,
  onJumpTo,
}: {
  summary: DryRunSummary | null;
  entries: LedgerEntry[];
  onJumpTo: (entryId: string) => void;
}) {
  if (!summary || summary.anomalies.length === 0) return null;

  const grouped = new Map<AnomalyCode, Anomaly[]>();
  for (const a of summary.anomalies) {
    const existing = grouped.get(a.code) ?? [];
    existing.push(a);
    grouped.set(a.code, existing);
  }
  const lineByEntry = new Map(entries.map((e) => [e.id, e.lineNo] as const));
  const orderedCodes = Array.from(grouped.keys()).sort((a, b) => {
    const aSev = grouped.get(a)![0].severity;
    const bSev = grouped.get(b)![0].severity;
    const ord: Record<AnomalySeverity, number> = { CRITICAL: 0, WARN: 1, INFO: 2 };
    if (ord[aSev] !== ord[bSev]) return ord[aSev] - ord[bSev];
    return ANOMALY_LABEL[a].localeCompare(ANOMALY_LABEL[b]);
  });

  return (
    <aside className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border bg-card p-4 text-sm">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Anomalies</h3>
        <span className="text-xs text-muted-foreground">
          {summary.anomalies.length}
        </span>
      </header>
      <div className="space-y-4">
        {orderedCodes.map((code) => {
          const items = grouped.get(code)!;
          const sev = items[0].severity;
          const tone = SEVERITY_TONE[sev];
          return (
            <section key={code}>
              <h4
                className={cn(
                  "mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
                )}
              >
                <SeverityIcon severity={sev} className="h-3.5 w-3.5" />
                <span>{ANOMALY_LABEL[code]}</span>
                <span
                  className={cn(
                    "ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                    tone.chip,
                  )}
                >
                  {items.length}
                </span>
              </h4>
              <ul className="space-y-1">
                {items.map((a) => (
                  <li key={`${a.entryId}:${a.code}:${a.message}`}>
                    <button
                      type="button"
                      onClick={() => onJumpTo(a.entryId)}
                      className={cn(
                        "block w-full cursor-pointer rounded-md border bg-background p-2 text-left text-xs transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2",
                        tone.ring,
                      )}
                    >
                      <span className="text-muted-foreground">
                        Line {lineByEntry.get(a.entryId) ?? "?"}
                      </span>
                      <p className="mt-0.5 text-foreground">{a.message}</p>
                      {a.suggestedFix ? (
                        <p className="mt-1 text-[11px] italic text-muted-foreground">
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
    </aside>
  );
}

export function AnomalyInlineBadge({
  anomaly,
}: {
  anomaly: Anomaly;
}) {
  const tone = SEVERITY_TONE[anomaly.severity];
  return (
    <div
      className={cn(
        "inline-flex items-start gap-1.5 rounded-md border px-2 py-1 text-[11px]",
        tone.chip,
      )}
    >
      <SeverityIcon
        severity={anomaly.severity}
        className="mt-0.5 h-3 w-3 shrink-0"
      />
      <span>
        <span className="font-semibold">{ANOMALY_LABEL[anomaly.code]}</span>
        <span className="ml-1">{anomaly.message}</span>
        {anomaly.suggestedFix ? (
          <span className="ml-1 italic opacity-80">
            ({anomaly.suggestedFix})
          </span>
        ) : null}
      </span>
    </div>
  );
}
