"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClientDate } from "@/components/ui/client-date";
import {
  ChevronLeftIcon,
  Lock,
  MedusaGridListIcon,
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

/**
 * StudioHeader is pure identity: back navigation, the switch-import sheet
 * trigger, the status chip, the (renamable) file title, and a stats strip.
 *
 * All verbs — Validate, Commit, Reset failed, Export, Rename trigger,
 * Roll back, Cancel & delete, the 3-dot overflow menu — live in
 * GoldShell.actions. Confirm dialogs live alongside the actions in
 * import-studio.tsx. See the layer-boundary doc at the top of
 * import-studio.tsx.
 */
export function StudioHeader({
  importData,
  renaming,
  renameValue,
  switchOpen,
  onRenameStart,
  onRenameValueChange,
  onRenameCancel,
  onRenameCommit,
  onSwitchOpenChange,
  focusRenameToken,
}: {
  importData: ImportDetail;
  renaming: boolean;
  renameValue: string;
  switchOpen: boolean;
  onRenameStart: () => void;
  onRenameValueChange: (v: string) => void;
  onRenameCancel: () => void;
  onRenameCommit: () => void;
  onSwitchOpenChange: (open: boolean) => void;
  /**
   * Token bumped by the parent when an external trigger (e.g. the
   * GoldShell.actions overflow menu) asks the header's rename input to
   * focus + select. The effect runs only on token change so it doesn't
   * call setState during render.
   */
  focusRenameToken: number | null;
}) {
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isLocked = importData.status === "COMMITTED";

  useEffect(() => {
    if (focusRenameToken == null) return;
    const id = window.setTimeout(() => renameInputRef.current?.select(), 50);
    return () => window.clearTimeout(id);
  }, [focusRenameToken]);

  return (
    <header className="flex shrink-0 flex-col border-b border-[--border]">
      {/* Identity row: nav + switch + status + title */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
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
            onClick={() => onSwitchOpenChange(true)}
            title="Switch import"
          >
            <MedusaGridListIcon className="h-3.5 w-3.5" />
            Switch
          </Button>
        </div>

        <span className="text-[--text-subtle]">/</span>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StatusChip
            status={STATUS_CHIP[importData.status] ?? "pending"}
            label={importData.status}
          />
          {renaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onBlur={onRenameCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameCommit();
                if (e.key === "Escape") onRenameCancel();
              }}
              className="min-w-0 flex-1 rounded border border-[--action-primary-bg] bg-[--surface-base] px-2 py-0.5 text-sm font-semibold text-[--text-strong] outline-none focus:ring-1 focus:ring-[--action-primary-bg]"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={onRenameStart}
              disabled={isLocked}
              className="min-w-0 truncate rounded px-1 py-0.5 text-left text-sm font-semibold text-[--text-strong] hover:bg-[--surface-muted] disabled:cursor-default disabled:hover:bg-transparent"
              title={isLocked ? importData.fileName : "Click to rename"}
            >
              {importData.fileName}
            </button>
          )}
          {isLocked && (
            <Lock
              className="h-3.5 w-3.5 shrink-0 text-[--text-muted]"
              aria-label="Committed — locked"
            />
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[--border]/60 bg-[--surface-muted]/40 px-4 py-1.5 text-[11px] text-[--text-muted]">
        <span className="font-mono tabular-nums">
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

      <Sheet open={switchOpen} onOpenChange={onSwitchOpenChange}>
        <SheetContent side="right" className="w-80 p-0">
          <SheetHeader className="border-b border-[--border] px-4 py-3">
            <SheetTitle className="text-sm">Switch import</SheetTitle>
          </SheetHeader>
          <StudioImportsSidebar
            currentImportId={importData.id}
            onCollapse={() => onSwitchOpenChange(false)}
          />
        </SheetContent>
      </Sheet>
    </header>
  );
}
