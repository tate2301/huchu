"use client";

import { useState } from "react";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
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
import { ClientDate } from "@/app/gold/components/client-date";
import { cn } from "@/lib/utils";
import { Lock } from "@/lib/icons";
import type { ImportDetail } from "../types";

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

type ConfirmKind = "commit" | "rollback" | "delete" | "reset" | null;

export function StudioHeader({
  importData,
  canCommit,
  isCommitting,
  isRollingBack,
  isResetting,
  isDeleting,
  isValidating,
  dryRunLabel,
  onCommit,
  onRollback,
  onResetFailed,
  onDelete,
  onValidate,
  siteIsSet,
  allMapped,
  mappedCount,
  totalNames,
  criticalCount,
  warnCount,
}: {
  importData: ImportDetail;
  canCommit: boolean;
  isCommitting: boolean;
  isRollingBack: boolean;
  isResetting: boolean;
  isDeleting: boolean;
  isValidating: boolean;
  dryRunLabel: string;
  onCommit: () => void;
  onRollback: () => void;
  onResetFailed: () => void;
  onDelete: () => void;
  onValidate: () => void;
  siteIsSet: boolean;
  allMapped: boolean;
  mappedCount: number;
  totalNames: number;
  criticalCount: number;
  warnCount: number;
}) {
  const [openConfirm, setOpenConfirm] = useState<ConfirmKind>(null);
  const isLocked = importData.status === "COMMITTED";

  return (
    <header className="flex shrink-0 flex-col gap-2 border-b border-[--border] bg-[--surface-base] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <StatusChip
            status={STATUS_CHIP[importData.status] ?? "pending"}
            label={importData.status}
          />
          <h1 className="truncate text-sm font-semibold text-[--text-strong]">
            {importData.fileName}
          </h1>
          {isLocked && (
            <Lock className="h-3.5 w-3.5 shrink-0 text-[--text-muted]" aria-label="Committed — locked" />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {!isLocked && (
            <Button
              size="sm"
              variant="outline"
              onClick={onValidate}
              disabled={isValidating}
              className="h-7 text-xs"
            >
              {isValidating ? "Validating…" : dryRunLabel}
            </Button>
          )}

          {importData.rowsFailed > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={isResetting}
              onClick={() => setOpenConfirm("reset")}
              className="h-7 text-xs"
            >
              {isResetting ? "Resetting…" : `Reset ${importData.rowsFailed} failed`}
            </Button>
          )}

          {importData.status !== "COMMITTED" && importData.status !== "FAILED" && (
            <Button
              size="sm"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setOpenConfirm("delete")}
              className="h-7 text-xs"
            >
              {isDeleting ? "Deleting…" : "Cancel"}
            </Button>
          )}

          {(importData.status === "COMMITTED" || importData.status === "FAILED") && (
            <Button
              size="sm"
              variant="destructive"
              disabled={isRollingBack}
              onClick={() => setOpenConfirm("rollback")}
              className="h-7 text-xs"
            >
              {isRollingBack ? "Rolling back…" : "Roll back"}
            </Button>
          )}

          {!isLocked && (
            <Button
              size="sm"
              disabled={!canCommit || isCommitting}
              onClick={() => setOpenConfirm("commit")}
              className="h-7 text-xs"
            >
              {isCommitting
                ? "Committing…"
                : importData.status === "ROLLED_BACK"
                  ? "Re-commit"
                  : "Commit import"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[--text-muted]">
        <div className="flex items-center gap-3">
          <span className="font-mono">
            {importData.rowsTotal} rows · {importData.rowsCreated} created ·{" "}
            {importData.rowsAnomaly} flagged · {importData.rowsFailed} failed
          </span>
          <span>
            Uploaded by {importData.uploadedBy?.name ?? "—"} on{" "}
            <ClientDate value={importData.createdAt} mode="date" />
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <PrereqPill ok={siteIsSet} label={`1. Site${siteIsSet ? " OK" : " needed"}`} />
          <PrereqPill
            ok={allMapped}
            label={`2. Leaders (${mappedCount}/${totalNames})`}
          />
          <PrereqPill
            ok={isLocked || (criticalCount === 0 && warnCount === 0)}
            warn={!isLocked && criticalCount === 0 && warnCount > 0}
            label={
              isLocked
                ? "3. Committed"
                : criticalCount > 0
                  ? `3. ${criticalCount} critical`
                  : warnCount > 0
                    ? `3. ${warnCount} warn`
                    : canCommit
                      ? "3. Ready"
                      : "3. Commit"
            }
          />
        </div>
      </div>

      <AlertDialog open={openConfirm === "commit"} onOpenChange={(o) => !o && setOpenConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Commit this import?</AlertDialogTitle>
            <AlertDialogDescription>
              {importData.rowsTotal} ledger rows will be processed and posted as allocations, pours, and receipts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setOpenConfirm(null); onCommit(); }}>
              Commit import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openConfirm === "reset"} onOpenChange={(o) => !o && setOpenConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reset {importData.rowsFailed} failed row{importData.rowsFailed === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will go back to PENDING. The next commit will retry only those rows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setOpenConfirm(null); onResetFailed(); }}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openConfirm === "delete"} onOpenChange={(o) => !o && setOpenConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this import?</AlertDialogTitle>
            <AlertDialogDescription>
              All entries in this uncommitted ledger will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep import</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { setOpenConfirm(null); onDelete(); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openConfirm === "rollback"} onOpenChange={(o) => !o && setOpenConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back this import?</AlertDialogTitle>
            <AlertDialogDescription>
              Allocations, pours, receipts, inventory and accounting events it produced will be deleted.
              Ledger entries will reset to PENDING so you can edit and re-commit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { setOpenConfirm(null); onRollback(); }}>
              Roll back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}

function PrereqPill({
  ok,
  warn,
  label,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
        ok
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : warn
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-[--border] text-[--text-muted]",
      )}
    >
      {label}
    </span>
  );
}
