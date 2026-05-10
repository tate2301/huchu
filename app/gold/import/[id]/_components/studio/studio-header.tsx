"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClientDate } from "@/app/gold/components/client-date";
import {
  ChevronLeftIcon,
  Lock,
  MoreHorizontal,
  MedusaGridListIcon,
  Pencil,
  Package,
  Layers,
  Download,
  RotateCcw,
  Trash2,
} from "@/lib/icons";
import { StudioImportsSidebar } from "./studio-imports-sidebar";
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
  isResetting,
  isValidating,
  dryRunLabel,
  onCommit,
  onRollback,
  onResetFailed,
  onDelete,
  onValidate,
  onRename,
  onExportCsv,
}: {
  importData: ImportDetail;
  canCommit: boolean;
  isCommitting: boolean;
  isResetting: boolean;
  isValidating: boolean;
  dryRunLabel: string;
  onCommit: () => void;
  onRollback: () => void;
  onResetFailed: () => void;
  onDelete: () => void;
  onValidate: () => void;
  onRename: (name: string) => void;
  onExportCsv: () => void;
}) {
  const [openConfirm, setOpenConfirm] = useState<ConfirmKind>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(importData.fileName);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isLocked = importData.status === "COMMITTED";

  const handleStartRename = () => {
    setRenameValue(importData.fileName);
    setRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 50);
  };

  const handleCommitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== importData.fileName) {
      onRename(trimmed);
    }
    setRenaming(false);
  };

  return (
    <header className="flex shrink-0 flex-col border-b border-[--border] bg-[--surface-base]">
      {/* Top row: navigation + title + primary actions */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        {/* Left: back link + switch sheet trigger */}
        <div className="flex items-center gap-1">
          <Button asChild size="sm" variant="ghost" className="h-7 px-2">
            <Link href="/gold/import">
              <ChevronLeftIcon className="h-4 w-4" />
              <span className="sr-only">All imports</span>
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs text-[--text-muted]"
            onClick={() => setSwitchOpen(true)}
            title="Switch import"
          >
            <MedusaGridListIcon className="h-3.5 w-3.5" />
            Switch import
          </Button>
        </div>

        <span className="text-[--text-subtle]">/</span>

        {/* Import title + status */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StatusChip
            status={STATUS_CHIP[importData.status] ?? "pending"}
            label={importData.status}
          />
          {renaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCommitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              className="min-w-0 flex-1 rounded border border-[--action-primary-bg] bg-[--surface-base] px-2 py-0.5 text-sm font-semibold text-[--text-strong] outline-none focus:ring-1 focus:ring-[--action-primary-bg]"
              autoFocus
            />
          ) : (
            <h1
              className="min-w-0 truncate text-sm font-semibold text-[--text-strong]"
              title={importData.fileName}
            >
              {importData.fileName}
            </h1>
          )}
          {isLocked && (
            <Lock
              className="h-3.5 w-3.5 shrink-0 text-[--text-muted]"
              aria-label="Committed — locked"
            />
          )}
        </div>

        {/* Right: primary actions + 3-dot menu */}
        <div className="flex items-center gap-1.5">
          {!isLocked && (
            <Button
              size="sm"
              variant="outline"
              onClick={onValidate}
              disabled={isValidating}
              className="h-8 text-xs"
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
              className="h-8 text-xs"
            >
              {isResetting
                ? "Resetting…"
                : `Reset ${importData.rowsFailed} failed`}
            </Button>
          )}

          {!isLocked && (
            <Button
              size="sm"
              disabled={!canCommit || isCommitting}
              onClick={() => setOpenConfirm("commit")}
              className="h-8 text-xs"
            >
              {isCommitting
                ? "Committing…"
                : importData.status === "ROLLED_BACK"
                  ? "Re-commit"
                  : "Commit import"}
            </Button>
          )}

          {/* 3-dot overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 px-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={handleStartRename}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCsv}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem disabled title="Duplicate requires a backend endpoint — planned follow-up">
                <Layers className="mr-2 h-3.5 w-3.5" />
                Duplicate
                <span className="ml-auto text-[10px] text-[--text-subtle]">
                  soon
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled title="Archive requires a backend endpoint — planned follow-up">
                <Package className="mr-2 h-3.5 w-3.5" />
                Archive
                <span className="ml-auto text-[10px] text-[--text-subtle]">
                  soon
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {(importData.status === "COMMITTED" ||
                importData.status === "FAILED") && (
                <DropdownMenuItem
                  className="text-rose-700 focus:text-rose-700"
                  onClick={() => setOpenConfirm("rollback")}
                >
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  Roll back
                </DropdownMenuItem>
              )}
              {importData.status !== "COMMITTED" &&
                importData.status !== "FAILED" && (
                  <DropdownMenuItem
                    className="text-rose-700 focus:text-rose-700"
                    onClick={() => setOpenConfirm("delete")}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Cancel &amp; delete
                  </DropdownMenuItem>
                )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-4 border-t border-[--border] bg-[--surface-muted] px-4 py-1.5 text-[11px] text-[--text-muted]">
        <span className="font-mono">
          {importData.rowsTotal} rows &middot; {importData.rowsCreated} created
          &middot; {importData.rowsAnomaly} flagged &middot;{" "}
          {importData.rowsFailed} failed
        </span>
        <span>
          by {importData.uploadedBy?.name ?? "—"} on{" "}
          <ClientDate value={importData.createdAt} mode="date" />
        </span>
        {importData.site && (
          <span className="font-medium text-[--text-strong]">
            {importData.site.code} &mdash; {importData.site.name}
          </span>
        )}
      </div>

      {/* Switch import sheet */}
      <Sheet open={switchOpen} onOpenChange={setSwitchOpen}>
        <SheetContent side="right" className="w-80 p-0">
          <SheetHeader className="border-b border-[--border] px-4 py-3">
            <SheetTitle className="text-sm">Switch import</SheetTitle>
          </SheetHeader>
          <StudioImportsSidebar
            currentImportId={importData.id}
            onCollapse={() => setSwitchOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Confirm dialogs */}
      <AlertDialog
        open={openConfirm === "commit"}
        onOpenChange={(o) => !o && setOpenConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Commit this import?</AlertDialogTitle>
            <AlertDialogDescription>
              {importData.rowsTotal} ledger rows will be processed and posted as
              allocations, pours, and receipts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpenConfirm(null);
                onCommit();
              }}
            >
              Commit import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={openConfirm === "reset"}
        onOpenChange={(o) => !o && setOpenConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reset {importData.rowsFailed} failed row
              {importData.rowsFailed === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will go back to PENDING. The next commit will retry only
              those rows.
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
              All entries in this uncommitted ledger will be removed. This
              cannot be undone.
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
              Allocations, pours, receipts, inventory and accounting events it
              produced will be deleted. Ledger entries will reset to PENDING so
              you can edit and re-commit.
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
    </header>
  );
}
