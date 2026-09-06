"use client";

import { ClientDate } from "@/components/ui/client-date";
import { Badge } from "@/components/ui/badge";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  FileText,
} from "@/lib/icons";
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

/**
 * KPI numeral block. Tones are reserved for *attention-worthy* states only:
 *   - emerald = positive progress (created rows > 0)
 *   - amber   = something to look at (flagged rows > 0)
 *   - rose    = something to fix    (failed rows > 0)
 *   - sky     = calm informational  (no action required)
 *   - default = neutral             (zero with no signal)
 * The default is `font-semibold` rather than `font-bold` so the page reads
 * calmly when there's nothing wrong; bold is reserved for the active number
 * an operator needs to act on.
 */
function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "amber" | "rose" | "emerald" | "sky";
}) {
  return (
    <div className="bg-[--surface-base] p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 font-mono text-2xl tabular-nums",
          tone === "amber" && "font-bold text-amber-700",
          tone === "rose" && "font-bold text-rose-700",
          tone === "emerald" && "font-bold text-emerald-700",
          tone === "sky" && "font-semibold text-sky-700",
          (!tone || tone === "default") && "font-semibold text-[--text-strong]",
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
  action,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon
        className={cn(
          "h-4 w-4 mt-0.5 shrink-0",
          ok
            ? "text-emerald-600"
            : warn
              ? "text-amber-600"
              : "text-[--text-subtle]",
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            ok ? "text-[--text-strong]" : "text-[--text-muted]",
          )}
        >
          {label}
        </p>
        {detail && <p className="text-xs text-[--text-muted]">{detail}</p>}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Four-segment progress bar: site / mappings / criticals / warnings.
 * Each segment is independently emerald (done), amber (warn-only), rose
 * (blocking) or grey (not yet evaluated). The strip lives above the
 * checklist as the at-a-glance answer to "where are we?".
 */
function CommitProgress({
  siteOk,
  mappingsOk,
  noCriticals,
  warnsCleared,
  validated,
}: {
  siteOk: boolean;
  mappingsOk: boolean;
  noCriticals: boolean;
  warnsCleared: boolean;
  validated: boolean;
}) {
  const seg = (tone: "ok" | "warn" | "block" | "pending") =>
    cn(
      "h-1.5 flex-1 rounded-sm",
      tone === "ok" && "bg-emerald-500",
      tone === "warn" && "bg-amber-400",
      tone === "block" && "bg-rose-500",
      tone === "pending" && "bg-[--surface-muted]",
    );
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      <span className={seg(siteOk ? "ok" : "block")} />
      <span className={seg(mappingsOk ? "ok" : "block")} />
      <span
        className={seg(!validated ? "pending" : noCriticals ? "ok" : "block")}
      />
      <span
        className={seg(!validated ? "pending" : warnsCleared ? "ok" : "warn")}
      />
    </div>
  );
}

export function TabOverview({
  importData,
  dryRun,
  isValidating,
  isCommitting,
  canCommit,
  siteIsSet,
  allMapped,
  mappedCount,
  totalNames,
  onValidate,
  onCommit,
  onSwitchToLedger,
  onSwitchToMappings,
}: {
  importData: ImportDetail;
  dryRun: DryRunSummary | null;
  isValidating: boolean;
  isCommitting?: boolean;
  canCommit?: boolean;
  siteIsSet: boolean;
  allMapped: boolean;
  mappedCount: number;
  totalNames: number;
  onValidate: () => void;
  onCommit?: () => void;
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

  const noCriticals = !dryRun || criticalCount === 0;
  const warnsCleared = !dryRun || warnCount === 0;
  const blockerCount =
    (siteIsSet ? 0 : 1) +
    (allMapped ? 0 : 1) +
    (!dryRun ? 1 : noCriticals ? 0 : 1);

  let readyLabel = "Not yet";
  let readyVariant: Parameters<typeof Badge>[0]["variant"] = "soft-danger";
  if (canCommit) {
    readyLabel = "Ready to commit";
    readyVariant = "soft-success";
  } else if (blockerCount === 1) {
    readyLabel = "Almost — 1 step left";
    readyVariant = "soft-warning";
  } else if (blockerCount > 0) {
    readyLabel = `${blockerCount} steps left`;
    readyVariant = "soft-warning";
  }

  return (
    <div className="space-y-6 p-6">
      {/* KPI cards. Tone applies only when the number is non-zero — calm
          panels when the operator has nothing to do. */}
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
          tone={anomalyRowCount > 0 ? "amber" : "sky"}
        />
        <KpiCard
          label="Failed"
          value={importData.rowsFailed}
          tone={importData.rowsFailed > 0 ? "rose" : "default"}
        />
      </dl>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Pre-commit checklist — owns the "are we ready?" question and
            carries the primary CTA inline so the operator doesn't have to
            scroll up to GoldShell.actions to act. */}
        {!isCommitted && (
          <div className="bg-[--surface-base] overflow-hidden">
            <header className="space-y-2 border-b border-[--border] bg-[--surface-muted] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[--text-strong]">
                  Ready to commit?
                </h2>
                <Badge variant={readyVariant}>{readyLabel}</Badge>
              </div>
              <CommitProgress
                siteOk={siteIsSet}
                mappingsOk={allMapped}
                noCriticals={noCriticals}
                warnsCleared={warnsCleared}
                validated={!!dryRun}
              />
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
                action={
                  !siteIsSet ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={onSwitchToMappings}
                    >
                      Assign
                    </Button>
                  ) : undefined
                }
              />
              <PrereqRow
                ok={allMapped}
                label={
                  allMapped
                    ? `All ${totalNames} leaders mapped`
                    : `${mappedCount} / ${totalNames} leaders mapped`
                }
                detail={
                  !allMapped
                    ? "Go to Mappings to assign leader groups"
                    : undefined
                }
                action={
                  !allMapped ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={onSwitchToMappings}
                    >
                      Map leaders
                    </Button>
                  ) : undefined
                }
              />
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
                  criticalCount > 0
                    ? "View flagged rows in the Ledger tab"
                    : undefined
                }
                action={
                  !dryRun ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={onValidate}
                      disabled={isValidating}
                    >
                      {isValidating ? "Validating…" : "Validate"}
                    </Button>
                  ) : criticalCount > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={onSwitchToLedger}
                    >
                      View {criticalCount}
                    </Button>
                  ) : undefined
                }
              />
              {warnCount > 0 && (
                <PrereqRow
                  ok={false}
                  warn
                  label={`${warnCount} warning${warnCount === 1 ? "" : "s"}`}
                  detail="You can commit with warnings — accept them in the Ledger tab."
                  action={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-[--action-primary-bg]"
                      onClick={onSwitchToLedger}
                    >
                      Review
                    </Button>
                  }
                />
              )}
            </div>
            {onCommit && (
              <div className="flex items-center justify-between gap-3 border-t border-[--border] bg-[--surface-muted]/60 px-4 py-3">
                <div className="text-[11px] text-[--text-muted]">
                  {canCommit
                    ? `Posting will create allocations, pours and receipts from ${importData.rowsTotal} rows.`
                    : "Resolve the steps above to enable commit."}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={onValidate}
                    disabled={isValidating}
                  >
                    {isValidating
                      ? "Validating…"
                      : dryRun
                        ? "Re-validate"
                        : "Validate"}
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={onCommit}
                    disabled={!canCommit || isCommitting}
                  >
                    {isCommitting ? "Committing…" : "Commit import"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Anomaly breakdown */}
        <div className="bg-[--surface-base] overflow-hidden">
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
                  <Badge variant="soft-danger">Blocks commit</Badge>
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
        <div className="bg-[--surface-base] overflow-hidden">
          <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
            <h2 className="text-sm font-semibold text-[--text-strong]">
              Source file
            </h2>
          </header>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                File name
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium text-[--text-strong] truncate">
                <FileText className="h-3.5 w-3.5 shrink-0 text-[--text-muted]" />
                {importData.fileName}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                Status
              </dt>
              <dd className="mt-1">
                <StatusChip
                  status={STATUS_CHIP[importData.status] ?? "pending"}
                  label={importData.status}
                />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                Uploaded by
              </dt>
              <dd className="mt-1 font-medium text-[--text-strong]">
                {importData.uploadedBy?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                Uploaded on
              </dt>
              <dd className="mt-1 font-mono font-medium text-[--text-strong]">
                <ClientDate value={importData.createdAt} mode="datetime" />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                Site
              </dt>
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
