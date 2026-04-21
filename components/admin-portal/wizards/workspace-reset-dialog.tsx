"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

import { executeOperation } from "@/components/admin-portal/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceResetPreview, WorkspaceResetResult } from "@/scripts/platform/types";

function formatRows(count: number) {
  return count.toLocaleString();
}

export function WorkspaceResetDialog({
  actorEmail,
  companyId,
  companyName,
  triggerLabel = "Reset workspace",
  onCompleted,
}: {
  actorEmail: string;
  companyId: string;
  companyName: string;
  triggerLabel?: string;
  onCompleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<WorkspaceResetPreview | null>(null);
  const [confirmationToken, setConfirmationToken] = useState("");
  const [reason, setReason] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkspaceResetResult | null>(null);
  const [previewRequestKey, setPreviewRequestKey] = useState(0);

  const loadPreview = useCallback(() => {
    if (!open) {
      return () => undefined;
    }

    let active = true;
    setLoadingPreview(true);
    setError(null);
    setPreview(null);

    void executeOperation<WorkspaceResetPreview>({
      module: "org",
      action: "previewResetWorkspace",
      payload: { companyId },
    })
      .then((payload) => {
        if (active) {
          setPreview(payload);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load workspace reset preview");
        }
      })
      .finally(() => {
        if (active) {
          setLoadingPreview(false);
        }
      });

    return () => {
      active = false;
    };
  }, [companyId, open]);

  useEffect(() => {
    if (!open) {
      setConfirmationToken("");
      setReason("");
      setError(null);
      setResult(null);
      setPreview(null);
      setLoadingPreview(false);
      setPreviewRequestKey(0);
      return;
    }

    return loadPreview();
  }, [loadPreview, open, previewRequestKey]);

  const canReset = useMemo(() => {
    if (!preview) {
      return false;
    }
    if (preview.activeSupportSessionCount > 0) {
      return false;
    }
    return confirmationToken.trim() === preview.confirmationToken;
  }, [confirmationToken, preview]);

  const runReset = async () => {
    if (!preview) {
      return;
    }

    setRunning(true);
    setError(null);
    try {
      const payload = await executeOperation<WorkspaceResetResult>({
        module: "org",
        action: "resetWorkspace",
        payload: {
          companyId,
          actor: actorEmail,
          confirmationToken,
          reason: reason.trim() || undefined,
        },
      });
      setResult(payload);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workspace reset failed");
    } finally {
      setRunning(false);
    }
  };

  const topTables = preview?.tablesToDelete.slice(0, 8) ?? [];

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Reset workspace</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-red-700">
                    This permanently deletes tenant-scoped workspace data for {companyName}.
                  </p>
                  <p className="text-sm text-red-700/90">
                    The company shell stays in place, but the workspace content is wiped so the tenant can start fresh.
                  </p>
                </div>
              </div>
            </div>

            {loadingPreview ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
                Loading workspace reset preview...
              </div>
            ) : preview ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Rows to delete
                    </p>
                    <p className="mt-2 font-mono text-2xl text-[var(--text-strong)]">
                      {formatRows(preview.totalRowsToDelete)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Tables touched
                    </p>
                    <p className="mt-2 font-mono text-2xl text-[var(--text-strong)]">
                      {preview.tablesToDelete.length}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Active superadmins kept
                    </p>
                    <p className="mt-2 font-mono text-2xl text-[var(--text-strong)]">
                      {preview.activePreservedAdminCount}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {preview.preservedAdminCount} total superadmin account(s) preserved.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-strong)]">
                          Deletion preview
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          Top tables that will be cleared for this workspace.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResult(null);
                          setPreviewRequestKey((value) => value + 1);
                        }}
                        disabled={loadingPreview || running}
                      >
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        Refresh preview
                      </Button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {topTables.length > 0 ? (
                        <>
                          {topTables.map((table) => (
                            <div
                              key={table.table}
                              className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2"
                            >
                              <span className="font-mono text-sm text-[var(--text-strong)]">
                                {table.table}
                              </span>
                              <Badge variant="outline" className="font-mono">
                                {formatRows(table.rowCount)}
                              </Badge>
                            </div>
                          ))}
                          {preview.tablesToDelete.length > topTables.length ? (
                            <p className="text-xs text-[var(--text-muted)]">
                              Showing the largest {topTables.length} tables out of {preview.tablesToDelete.length}.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="rounded-xl bg-[var(--surface-muted)] px-3 py-4 text-sm text-[var(--text-muted)]">
                          No company-scoped rows are scheduled for deletion.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] px-4 py-4">
                    <p className="text-sm font-semibold text-[var(--text-strong)]">
                      What stays
                    </p>
                    <div className="mt-3 space-y-2">
                      {preview.preservedScopes.map((scope) => (
                        <div
                          key={scope}
                          className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-muted)]"
                        >
                          {scope}
                        </div>
                      ))}
                    </div>
                    {preview.activeSupportSessionCount > 0 ? (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                        {preview.activeSupportSessionCount} active support session(s) must be ended before reset.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="workspace-reset-confirmation">
                      Type <span className="font-mono">{preview.confirmationToken}</span> to confirm
                    </Label>
                    <Input
                      id="workspace-reset-confirmation"
                      value={confirmationToken}
                      onChange={(event) => setConfirmationToken(event.target.value)}
                      placeholder={preview.confirmationToken}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workspace-reset-reason">Reason</Label>
                    <Textarea
                      id="workspace-reset-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Why is this workspace being reset?"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {result ? (
              <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                <p>
                  Reset complete. Deleted {formatRows(result.totalRowsDeleted)} rows across {result.deletedTables.length} table(s).
                </p>
                {result.deletedTables.length > 0 ? (
                  <div className="space-y-2">
                    {result.deletedTables.slice(0, 5).map((table) => (
                      <div
                        key={table.table}
                        className="flex items-center justify-between rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2"
                      >
                        <span className="font-mono text-sm text-emerald-950">{table.table}</span>
                        <span className="font-mono text-xs text-emerald-900">{formatRows(table.rowCount)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={() => void runReset()}
              disabled={!canReset || running || Boolean(result)}
            >
              {running ? "Resetting..." : "Delete workspace data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
