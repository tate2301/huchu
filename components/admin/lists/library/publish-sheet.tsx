"use client";

import { useState } from "react";
import { Button } from "@corelithzw/react";

import { ReachPicker, reachOf, type ReachDraft } from "@/components/admin/library/reach-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { AdminSheetProps } from "../admin-list";
import { postBulk } from "../post-bulk";

/** Library › Publish: the ticked items, to everyone, chosen verticals or chosen workspaces. */
export function LibraryPublishSheet({ ids, close, done }: AdminSheetProps) {
  const [draft, setDraft] = useState<ReachDraft>({ audience: "EVERYONE", verticals: [], workspaces: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = ids.length;

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const said = await postBulk("/api/platform-admin/library/publish", { ids, reach: reachOf(draft) }, "published", ["item", "items"]);
      done(said.title, said.variant);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{count === 1 ? "Publish this item" : `Publish ${count} items`}</DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            Workspaces read it live: a change here reaches them on their next visit. A copy a workspace makes stays theirs.
          </DialogDescription>
        </DialogHeader>
        <ReachPicker value={draft} onChange={setDraft} />
        {error ? (
          <p role="alert" className="text-sm text-[var(--bad)]">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={go}>
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
