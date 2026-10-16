"use client";

import { useState } from "react";
import { Button } from "@corelithzw/react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { AdminSheetProps } from "./admin-list";
import { postBulk } from "./post-bulk";

const DAYS = [7, 14, 30] as const;

/** Workspaces › Extend trials: each trial runs on from where it ends, by the days chosen. */
export function ExtendTrialSheet({ ids, close, done }: AdminSheetProps) {
  const [days, setDays] = useState<(typeof DAYS)[number]>(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = ids.length;

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const said = await postBulk("/api/platform-admin/workspaces/extend-trial", { ids, days }, `extended by ${days} days`, [
        "trial",
        "trials",
      ]);
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
          <DialogTitle>{count === 1 ? "Extend the trial" : `Extend ${count} trials`}</DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            Each runs on from the day it ends, or from today if it has ended. A workspace not on a trial is left as it is.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex gap-2">
          <legend className="sr-only">By how many days</legend>
          {DAYS.map((value) => (
            <label
              key={value}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]"
            >
              <input type="radio" name="days" value={value} checked={days === value} onChange={() => setDays(value)} />
              {value} days
            </label>
          ))}
        </fieldset>
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
            Extend by {days} days
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
