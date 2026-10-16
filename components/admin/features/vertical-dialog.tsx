"use client";

import { useState } from "react";
import type { Vertical } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { postBulk } from "@/components/admin/lists/post-bulk";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Field } from "@/components/workspace/fields/field";
import { TextArea } from "@/components/workspace/fields/text-area";
import { Plus } from "@/lib/icons";
import { VERTICAL_ORDER, VERTICAL_RATE, VERTICALS } from "@/lib/platform/verticals";

const CHOICE =
  "flex min-h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)] has-[:disabled]:cursor-default has-[:disabled]:text-[var(--ink-3)]";

const WORKSPACES: [string, string] = ["workspace", "workspaces"];

export type VerticalDialogProps = {
  mode: "add" | "remove";
  /** Workspace ids. */
  ids: string[];
  /** One workspace's verticals: those it has cannot be added, those it lacks cannot be removed. */
  held?: Vertical[];
  close: () => void;
  done: (title: string, variant?: "success" | "warning") => void;
};

/**
 * Adds a vertical to the workspaces named, or removes one. Adding turns its
 * features on and adds its charge; removing stops the charge and switches off
 * what only it brought. Records are kept either way.
 */
export function VerticalDialog({ mode, ids, held, close, done }: VerticalDialogProps) {
  const adding = mode === "add";
  const offered = VERTICAL_ORDER.filter((vertical) => !held || (adding ? !held.includes(vertical) : held.includes(vertical)));
  const [vertical, setVertical] = useState<Vertical | null>(offered.length === 1 ? offered[0]! : null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = ids.length;
  const many = count > 1 ? ` ${count} workspaces` : "";
  const onlyOne = !adding && held?.length === 1;

  const go = async () => {
    if (!vertical) {
      setError("Choose a vertical.");
      return;
    }
    if (!adding && reason.trim().length < 3) {
      setError("Say why, so the owner can see it in their audit log.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const label = VERTICALS[vertical].label;
      const said = await postBulk(
        `/api/platform-admin/verticals/${mode}`,
        adding ? { ids, vertical } : { ids, vertical, reason: reason.trim() },
        adding ? `now on ${label}` : `taken off ${label}`,
        WORKSPACES,
      );
      done(said.title, said.variant);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{adding ? `Add a vertical to${many || " this workspace"}` : `Remove a vertical from${many || " this workspace"}`}</DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            {adding
              ? `Its features are switched on now. Each vertical is $${VERTICAL_RATE.small} a month, or $${VERTICAL_RATE.large} once a workspace has more than ${VERTICAL_RATE.includedMembers} members.`
              : "Its charge stops from the next bill. Features only it brought are switched off; records are kept, and adding it again turns them back on. A workspace keeps at least one vertical."}
          </DialogDescription>
        </DialogHeader>
        {onlyOne ? (
          <p className="t-body-sm text-[var(--text-muted)]">This workspace has one vertical. Add another first.</p>
        ) : offered.length === 0 ? (
          <p className="t-body-sm text-[var(--text-muted)]">It has every vertical already.</p>
        ) : (
          <fieldset className="grid gap-2">
            <legend className="sr-only">Vertical</legend>
            {offered.map((value) => (
              <label key={value} className={CHOICE}>
                <input type="radio" name="vertical" value={value} checked={vertical === value} onChange={() => setVertical(value)} />
                {VERTICALS[value].label}
              </label>
            ))}
          </fieldset>
        )}
        {!adding && !onlyOne ? (
          <Field label="Why" hint="The owner sees this in their audit log.">
            {(control) => (
              <TextArea {...control} rows={2} maxLength={300} value={reason} placeholder="What happened, and who asked" onChange={(event) => setReason(event.target.value)} />
            )}
          </Field>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-[var(--bad)]">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          {onlyOne || offered.length === 0 ? null : (
            <Button variant={adding ? "primary" : "danger"} loading={busy} onClick={go}>
              {adding ? "Add vertical" : "Remove vertical"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The Verticals tab's header action: one workspace, the verticals it lacks. */
export function AddVerticalButton({ workspaceId, held }: { workspaceId: string; held: Vertical[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  if (held.length >= VERTICAL_ORDER.length) return null;
  return (
    <>
      <Button variant="primary" startIcon={<Plus aria-hidden="true" />} onClick={() => setOpen(true)}>
        Add a vertical
      </Button>
      {open ? (
        <VerticalDialog
          mode="add"
          ids={[workspaceId]}
          held={held}
          close={() => setOpen(false)}
          done={(title, variant = "success") => {
            toast({ title, variant });
            setOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["list"] });
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
