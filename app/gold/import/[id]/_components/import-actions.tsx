"use client";

import Link from "next/link";
import { useState } from "react";
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
import { ChevronLeftIcon } from "@/lib/icons";

export type ImportActionsProps = {
  status:
    | "DRAFT"
    | "MAPPING"
    | "PREVIEW"
    | "COMMITTED"
    | "FAILED"
    | "ROLLED_BACK";
  rowsFailed: number;
  canCommit: boolean;
  isCommitting: boolean;
  isRollingBack: boolean;
  isResetting: boolean;
  isDeleting: boolean;
  isValidating: boolean;
  onCommit: () => void;
  onRollback: () => void;
  onResetFailed: () => void;
  onDelete: () => void;
  onValidate: () => void;
  validateLabel: string;
};

export function ImportActions({
  status,
  rowsFailed,
  canCommit,
  isCommitting,
  isRollingBack,
  isResetting,
  isDeleting,
  isValidating,
  onCommit,
  onRollback,
  onResetFailed,
  onDelete,
  onValidate,
  validateLabel,
}: ImportActionsProps) {
  const isLocked = status === "COMMITTED";
  const [openConfirm, setOpenConfirm] = useState<
    "delete" | "rollback" | "reset" | null
  >(null);

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="ghost">
        <Link href="/gold/import">
          <ChevronLeftIcon className="mr-1 h-4 w-4" /> All imports
        </Link>
      </Button>

      {!isLocked ? (
        <Button
          size="sm"
          variant="outline"
          onClick={onValidate}
          disabled={isValidating}
        >
          {isValidating ? "Validating…" : validateLabel}
        </Button>
      ) : null}

      {rowsFailed > 0 ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isResetting}
          onClick={() => setOpenConfirm("reset")}
        >
          {isResetting
            ? "Resetting..."
            : `Reset ${rowsFailed} failed`}
        </Button>
      ) : null}

      {status !== "COMMITTED" && status !== "FAILED" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isDeleting}
          onClick={() => setOpenConfirm("delete")}
        >
          {isDeleting ? "Deleting..." : "Cancel & delete"}
        </Button>
      ) : null}

      {status === "COMMITTED" || status === "FAILED" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isRollingBack}
          onClick={() => setOpenConfirm("rollback")}
        >
          {isRollingBack ? "Rolling back..." : "Roll back"}
        </Button>
      ) : null}

      {!isLocked ? (
        <Button
          size="sm"
          disabled={!canCommit || isCommitting}
          onClick={onCommit}
        >
          {isCommitting
            ? "Committing..."
            : status === "ROLLED_BACK"
              ? "Re-commit"
              : "Commit import"}
        </Button>
      ) : null}

      <AlertDialog
        open={openConfirm === "reset"}
        onOpenChange={(o) => !o && setOpenConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reset {rowsFailed} failed row{rowsFailed === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll go back to PENDING and any (rare) artifacts will be
              wiped. The next commit will retry just those rows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpenConfirm(null);
                onResetFailed();
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={openConfirm === "delete"}
        onOpenChange={(o) => !o && setOpenConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this import?</AlertDialogTitle>
            <AlertDialogDescription>
              All entries in this (uncommitted) ledger will be removed. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep import</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setOpenConfirm(null);
                onDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={openConfirm === "rollback"}
        onOpenChange={(o) => !o && setOpenConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back this import?</AlertDialogTitle>
            <AlertDialogDescription>
              Allocations, pours, receipts, inventory + accounting events,
              and shift reports it produced will be deleted. The ledger
              entries reset to PENDING so you can edit and re-commit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setOpenConfirm(null);
                onRollback();
              }}
            >
              Roll back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
