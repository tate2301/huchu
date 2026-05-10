"use client";

import { ClientDate } from "@/app/gold/components/client-date";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, XCircle, FileText } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { ImportDetail, DryRunSummary } from "../types";

const STATUS_CHIP: Record<
  ImportDetail["status"],
  Parameters<typeof StatusChip>[0]["status"]
> = {
  COMMITTED: "passing",
  FAILED: "failing",
  ROLLED_BACK: "need_changes",
  PREVIEW: "in_review",
  MAPPING: "in_progress",
  DRAFT: "pending",
};

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "amber" | "rose" | "emerald";
}) {
  return (
    <div className="rounded-lg border border-[--border] bg-[--surface-base] p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 font-mono text-2xl font-bold",
          tone === "amber" && "text-amber-700",
          tone === "rose" && "text-rose-700",
          tone === "emerald" && "text-emerald-700",
          (!tone || tone === "default") && "text-[--text-strong]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function PrereqRow({
  ok,
  warn,
  label,
  detail,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
  detail?: string;
}) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon
        className={cn(
          "h-4 w-4 mt-0.5 shrink-0",
          ok ? "text-emerald-600" : warn ? "text-amber-600" : "text-[--text-subtle]",
        )}
      />
      <div>
        <p className={cn("text-sm font-medium", ok ? "text-[--text-strong]" : "text-[--text-muted]")}>
          {label}
        </p>
        {detail && (
          <p className="text-xs text-[--text-muted]">{detail}</p>
        )}
      </div>
    </div>
  );
}

export function TabOverview({
  importData,
  dryRun,
  isValidating,
  siteIsSet,
  allMapped,
  mappedCount,
  totalNames,
  onValidate,
  onSwitchToLedger,
  onSwitchToMappings,
}: {
  importData: ImportDetail;
  dryRun: DryRunSummary | null;
  isValidating: boolean;
  siteIsSet: boolean;
  allMapped: boolean;
  mappedCount: number;
  totalNames: number;
  onValidate: () => void;
  onSwitchToLedger: () => void;
  onSwitchToMappings: () => void;
}) {
  const isCommitted = importData.status === "COMMITTED";

  const criticalCount = dryRun?.countsBySeverity.CRITICAL ?? 0;
  const warnCount = dryRun?.countsBySeverity.WARN ?? 0;
  const infoCount = dryRun?.countsBySeverity.INFO ?? 0;
  const anomalyRowCount = isCommitted
    ? importData.rowsAnomaly
    : dryRun
      ? dryRun.anomalies.length
      : importData.rowsAnomaly;

  return (
    <div className="space-y-6 p-6">
      {/* KPI cards */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total rows" value={importData.rowsTotal} />
        <KpiCard
          label="Created"
          value={importData.rowsCreated}
          tone={importData.rowsCreated > 0 ? "emerald" : "default"}
        />
        <KpiCard
          label="Flagged"
          value={anomalyRowCount}
          tone={anomalyRowCount > 0 ? "amber" : "default"}
        />
        <KpiCard
          label="Failed"
          value={importData.rowsFailed}
          tone={importData.rowsFailed > 0 ? "rose" : "default"}
        />
      </dl>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Pre-commit checklist */}
        {!isCommitted && (
          <div className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
            <header className="flex items-center justify-between border-b border-[--border] bg-[--surface-muted] px-4 py-3">
              <h2 className="text-sm font-semibold text-[--text-strong]">
                Pre-commit checklist
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={onValidate}
                disabled={isValidating}
                className="h-7 text-xs"
              >
                {isValidating ? "Validating…" : dryRun ? "Re-validate" : "Validate"}
              </Button>
            </header>
            <div className="divide-y divide-[--border] px-4">
              <PrereqRow
                ok={siteIsSet}
                label="Site assigned"
                detail={
                  siteIsSet
                    ? `${importData.site?.code} — ${importData.site?.name}`
                    : "Assign a site in the Mappings tab"
                }
              />
              <button
                type="button"
                className="w-full text-left"
                onClick={!allMapped ? onSwitchToMappings : undefined}
              >
                <PrereqRow
                  ok={allMapped}
                  label={
                    allMapped
                      ? `All ${totalNames} leaders mapped`
                      : `${mappedCount} / ${totalNames} leaders mapped`
                  }
                  detail={!allMapped ? "Go to Mappings to assign leader groups" : undefined}
                />
              </button>
              <PrereqRow
                ok={!dryRun || criticalCount === 0}
                warn={!dryRun}
                label={
                  !dryRun
                    ? "Validation pending"
                    : criticalCount > 0
                      ? `${criticalCount} critical anomal${criticalCount === 1 ? "y" : "ies"} to resolve`
                      : "No critical anomalies"
                }
                detail={
                  criticalCount > 0 ? "View flagged rows in the Ledger tab" : undefined
                }
              />
              {warnCount > 0 && (
                <PrereqRow
                  ok={false}
                  warn
                  label={`${warnCount} warning${warnCount === 1 ? "" : "s"} (can commit with warnings)`}
                />
              )}
            </div>
          </div>
        )}

        {/* Anomaly breakdown */}
        <div className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
          <header className="flex items-center justify-between border-b border-[--border] bg-[--surface-muted] px-4 py-3">
            <h2 className="text-sm font-semibold text-[--text-strong]">
              Anomalies
            </h2>
            {anomalyRowCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onSwitchToLedger}
                className="h-7 text-xs text-[--action-primary-bg]"
              >
                View in Ledger
              </Button>
            )}
          </header>
          {isValidating ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : !dryRun && !isCommitted ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-[--text-muted]">
              <p>
                {importData.rowsAnomaly > 0
                  ? `${importData.rowsAnomaly} rows flagged from last validation.`
                  : "Run validation to check for anomalies."}
              </p>
              {importData.rowsAnomaly === 0 && (
                <Button size="sm" variant="outline" onClick={onValidate}>
                  Validate now
                </Button>
              )}
            </div>
          ) : anomalyRowCount === 0 ? (
            <div className="flex items-center gap-2 p-4 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              No anomalies detected.
            </div>
          ) : (
            <div className="divide-y divide-[--border]">
              {criticalCount > 0 && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-rose-800">
                      {criticalCount} critical
                    </span>
                  </div>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    Blocks commit
                  </span>
                </div>
              )}
              {warnCount > 0 && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    {warnCount} warning{warnCount === 1 ? "" : "s"}
                  </span>
                </div>
              )}
              {infoCount > 0 && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Info className="h-4 w-4 shrink-0 text-sky-600" />
                  <span className="text-sm font-medium text-sky-800">
                    {infoCount} info
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Source file metadata */}
        <div className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
          <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
            <h2 className="text-sm font-semibold text-[--text-strong]">
              Source file
            </h2>
          </header>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">File name</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium text-[--text-strong] truncate">
                <FileText className="h-3.5 w-3.5 shrink-0 text-[--text-muted]" />
                {importData.fileName}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Status</dt>
              <dd className="mt-1">
                <StatusChip
                  status={STATUS_CHIP[importData.status] ?? "pending"}
                  label={importData.status}
                />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Uploaded by</dt>
              <dd className="mt-1 font-medium text-[--text-strong]">
                {importData.uploadedBy?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Uploaded on</dt>
              <dd className="mt-1 font-mono font-medium text-[--text-strong]">
                <ClientDate value={importData.createdAt} mode="datetime" />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Site</dt>
              <dd className="mt-1 font-medium text-[--text-strong]">
                {importData.site
                  ? `${importData.site.code} — ${importData.site.name}`
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
