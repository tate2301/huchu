"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Input, Skeleton } from "@corelithzw/react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/admin/workspace-context";
import type { ResetGroup, ResetPreview } from "@/lib/admin/workspace-reset";
import { formatCount } from "@/lib/workspace/format";

export type ResetActions = {
  preview: () => Promise<{ ok: true; preview: ResetPreview } | { ok: false; error: string }>;
  reset: (input: { groupIds: string[]; typed: string; reason: string }) => Promise<ActionResult>;
};

const rows = (n: number) => `${formatCount(n)} ${n === 1 ? "row" : "rows"}`;

/**
 * Settings › Delete the workspace's data: choose the modules and the shared
 * records to delete, see every table and how many rows go, then type the
 * words and say why. The workspace, its owners, its subscription and its audit
 * log stay. Nothing is deleted until the last button.
 */
export function ResetDataDialog({
  open,
  onOpenChange,
  workspaceName,
  actions,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  actions: ResetActions;
  onDone: (message: string) => void;
}) {
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPreview(null);
    setLoadError(null);
    setChosen(new Set());
    setTyped("");
    setWhy("");
    setError(null);
    actions
      .preview()
      .then((answer) => {
        if (!live) return;
        if (answer.ok) setPreview(answer.preview);
        else setLoadError(answer.error);
      })
      .catch(() => live && setLoadError("What would be deleted could not be read. Try again."));
    return () => {
      live = false;
    };
    // Read once each time it opens; the actions are the page's, bound to its workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tables = useMemo(() => (preview ? preview.tables.filter((table) => chosen.has(table.group)) : []), [chosen, preview]);
  const total = tables.reduce((sum, table) => sum + table.rows, 0);
  const choosable = preview?.groups.filter((group) => !group.disabled) ?? [];
  const blocked = preview && preview.openSessions > 0;
  const ready = Boolean(preview) && !blocked && chosen.size > 0 && typed.trim() === preview?.confirmation && why.trim().length >= 3;

  const toggle = (id: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await actions.reset({ groupIds: [...chosen], typed, reason: why });
      if (!outcome.ok) throw new Error(outcome.error);
      onDone(outcome.message);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work. Nothing was deleted; try again.");
    } finally {
      setBusy(false);
    }
  };

  const groupList = (title: string, groups: ResetGroup[]) =>
    groups.length ? (
      <fieldset className="space-y-1.5">
        <legend className="t-label mb-1.5 text-[var(--ink)]">{title}</legend>
        {groups.map((group) => (
          <label
            key={group.id}
            className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)] has-[:disabled]:cursor-default has-[:disabled]:opacity-60"
          >
            <Checkbox
              className="mt-0.5"
              checked={chosen.has(group.id)}
              disabled={group.disabled || busy}
              onChange={(event) => toggle(group.id, event.target.checked)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-[var(--ink)]">{group.label}</span>
                <span className="shrink-0 font-mono text-[13px] text-[var(--ink-3)]">{group.disabled ? "Nothing yet" : rows(group.rows)}</span>
              </span>
              <span className="block text-[13px] text-[var(--text-muted)]">{group.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delete {workspaceName}&apos;s data?</DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            The rows chosen are deleted for good, so the workspace can start again. It stays, with its owners, address, billing and audit
            log. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p role="alert" className="text-sm text-[var(--bad)]">
            {loadError}
          </p>
        ) : !preview ? (
          <div className="space-y-2" aria-busy="true" aria-label="Reading what the workspace holds">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : (
          <div className="space-y-5">
            {blocked ? (
              <p role="alert" className="rounded-[var(--radius-sm)] bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--warn-line)]">
                Someone from support is signed in to {workspaceName}. End {preview.openSessions === 1 ? "that session" : "those sessions"} under
                Who is in first.
              </p>
            ) : null}
            {choosable.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{workspaceName} holds no data that can be deleted.</p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              {groupList("Modules", preview.groups.filter((group) => group.kind === "module"))}
              {groupList("Shared records", preview.groups.filter((group) => group.kind === "foundation"))}
            </div>

            <section aria-label="What goes" className="space-y-1.5">
              <h3 className="t-label text-[var(--ink)]">
                {tables.length ? `What goes: ${rows(total)} from ${formatCount(tables.length)} ${tables.length === 1 ? "table" : "tables"}` : "What goes"}
              </h3>
              {tables.length ? (
                <ul className="max-h-48 divide-y divide-[var(--line)] overflow-y-auto border-y border-[var(--line)]">
                  {tables.map((table) => (
                    <li key={table.table} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span className="truncate font-mono text-[var(--ink-2)]">{table.table}</span>
                      <span className="shrink-0 font-mono text-[var(--ink-3)]">{formatCount(table.rows)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Choose a module or shared records to see the tables and rows that go.</p>
              )}
            </section>

            <section aria-label="What stays" className="space-y-1">
              <h3 className="t-label text-[var(--ink)]">What stays</h3>
              <p className="text-sm text-[var(--text-muted)]">
                {preview.keeps.join(". ")}. {preview.owners === 1 ? "Its 1 owner" : `Its ${formatCount(preview.owners)} owners`} can sign in
                afterwards.
              </p>
            </section>

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label={`Type ${preview.confirmation} to go ahead`}
                value={typed}
                placeholder={preview.confirmation}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setTyped(event.target.value)}
              />
              <Input
                label="Why"
                value={why}
                maxLength={300}
                placeholder="The owner asked to start again after the trial"
                disabled={busy}
                onChange={(event) => setWhy(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-[var(--bad)]">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Keep the data
          </Button>
          <Button variant="danger" loading={busy} disabled={!ready} onClick={go}>
            {tables.length ? `Delete ${rows(total)}` : "Delete the data"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
