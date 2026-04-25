"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCcw } from "@/lib/icons";

import { executeOperation } from "@/components/admin-portal/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
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
      setSelectedGroupIds([]);
      setPreview(null);
      setLoadingPreview(false);
      setPreviewRequestKey(0);
      return;
    }

    return loadPreview();
  }, [loadPreview, open, previewRequestKey]);

  useEffect(() => {
    if (!preview) {
      return;
    }

    const availableGroupIds = new Set(
      preview.availableGroups
        .filter((group) => !group.disabled)
        .map((group) => group.id),
    );
    setSelectedGroupIds((current) =>
      current.filter((groupId) => availableGroupIds.has(groupId)),
    );
  }, [preview]);

  const availableGroups = useMemo(
    () => preview?.availableGroups ?? [],
    [preview],
  );
  const moduleGroups = useMemo(
    () => availableGroups.filter((group) => group.kind === "module"),
    [availableGroups],
  );
  const foundationGroups = useMemo(
    () => availableGroups.filter((group) => group.kind === "foundation"),
    [availableGroups],
  );
  const selectableGroupIds = useMemo(
    () => availableGroups.filter((group) => !group.disabled).map((group) => group.id),
    [availableGroups],
  );
  const selectedGroupIdSet = useMemo(
    () => new Set(selectedGroupIds),
    [selectedGroupIds],
  );
  const allResettableSelected =
    selectableGroupIds.length > 0 &&
    selectableGroupIds.every((groupId) => selectedGroupIdSet.has(groupId));
  const selectedTables = useMemo(() => {
    if (!preview) {
      return [];
    }
    return preview.tablesToDelete.filter((table) => selectedGroupIdSet.has(table.groupId));
  }, [preview, selectedGroupIdSet]);
  const selectedRowCount = useMemo(
    () => selectedTables.reduce((sum, table) => sum + table.rowCount, 0),
    [selectedTables],
  );
  const selectedGroupLabels = useMemo(
    () =>
      availableGroups
        .filter((group) => selectedGroupIdSet.has(group.id))
        .map((group) => group.label),
    [availableGroups, selectedGroupIdSet],
  );

  const canReset = useMemo(() => {
    if (!preview) {
      return false;
    }
    if (preview.activeSupportSessionCount > 0) {
      return false;
    }
    if (selectedGroupIds.length === 0) {
      return false;
    }
    return confirmationToken.trim() === preview.confirmationToken;
  }, [confirmationToken, preview, selectedGroupIds.length]);

  const toggleGroup = (groupId: string, checked: boolean) => {
    setResult(null);
    setSelectedGroupIds((current) => {
      if (checked) {
        return current.includes(groupId) ? current : [...current, groupId];
      }
      return current.filter((value) => value !== groupId);
    });
  };

  const toggleAllGroups = (checked: boolean) => {
    setResult(null);
    setSelectedGroupIds(checked ? selectableGroupIds : []);
  };

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
          scope: allResettableSelected ? "ALL" : "GROUPS",
          groupIds: selectedGroupIds,
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

  const topTables = selectedTables.slice(0, 8);

  const renderGroupList = (
    title: string,
    emptyState: string,
    groups: WorkspaceResetPreview["availableGroups"],
  ) => (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-[var(--text-strong)]">{title}</p>
      </div>
      {groups.length > 0 ? (
        <div className="space-y-2">
          {groups.map((group) => {
            const checked = selectedGroupIdSet.has(group.id);
            const disabled = group.disabled || running;
            return (
              <label
                key={group.id}
                className={`flex items-start gap-3 rounded-2xl border px-3 py-3 ${
                  checked
                    ? "border-[var(--action-primary-bg)] bg-[var(--action-secondary-bg)]"
                    : "border-[var(--border)] bg-[var(--surface-base)]"
                } ${disabled ? "opacity-70" : ""}`}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(nextChecked) => toggleGroup(group.id, nextChecked === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-strong)]">
                        {group.label}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {group.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {formatRows(group.rowCount)} rows
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {group.tableCount} tables
                      </Badge>
                    </div>
                  </div>
                  {group.disabled ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      No deletable rows are currently available for this group.
                    </p>
                  ) : null}
                </div>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-4 text-sm text-[var(--text-muted)]">
          {emptyState}
        </div>
      )}
    </div>
  );

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
                      {formatRows(selectedRowCount)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {formatRows(preview.totalRowsAvailable)} available across all reset groups.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Tables touched
                    </p>
                    <p className="mt-2 font-mono text-2xl text-[var(--text-strong)]">
                      {selectedTables.length}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {selectedGroupIds.length > 0
                        ? `${selectedGroupIds.length} group(s) selected`
                        : "Select one or more reset groups."}
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

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-strong)]">
                        Reset scope
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Choose the module and foundation data groups to clear for this workspace.
                      </p>
                    </div>
                    <label className="flex items-center gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2">
                      <Checkbox
                        checked={allResettableSelected}
                        disabled={selectableGroupIds.length === 0 || running}
                        onCheckedChange={(checked) => toggleAllGroups(checked === true)}
                      />
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-strong)]">
                          All resettable data
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          Keeps the current full workspace reset behavior.
                        </p>
                      </div>
                    </label>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {renderGroupList(
                      "Modules",
                      "No relevant business modules are available for reset.",
                      moduleGroups,
                    )}
                    {renderGroupList(
                      "Foundation data",
                      "No shared foundation data is currently available for reset.",
                      foundationGroups,
                    )}
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
                          Top tables that will be cleared for the current selection.
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
                    {selectedGroupLabels.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedGroupLabels.map((label) => (
                          <Badge key={label} variant="secondary">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
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
                          {selectedTables.length > topTables.length ? (
                            <p className="text-xs text-[var(--text-muted)]">
                              Showing the largest {topTables.length} tables out of {selectedTables.length}.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="rounded-xl bg-[var(--surface-muted)] px-3 py-4 text-sm text-[var(--text-muted)]">
                          {selectedGroupIds.length > 0
                            ? "No company-scoped rows are scheduled for deletion for the selected groups."
                            : "Select one or more reset groups to preview the tables that will be cleared."}
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
                  Reset complete. Deleted {formatRows(result.totalRowsDeleted)} rows across {result.deletedTables.length} table(s)
                  {result.selectedGroupLabels.length > 0 ? ` from ${result.selectedGroupLabels.join(", ")}.` : "."}
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
              {running
                ? "Resetting..."
                : allResettableSelected
                  ? "Delete workspace data"
                  : "Delete selected data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
