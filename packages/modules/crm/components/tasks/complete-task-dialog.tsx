"use client";

import { useState } from "react";

import { Button } from "@corelithzw/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { CRM_TASK_OUTCOME_LABELS, outcomesForType } from "../../tasks";
import type { CrmTaskRecord } from "../../crm-v2";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * Completing a call or an email asks what happened.
 *
 * The whole point of typed tasks is that "we rang them twice and nobody
 * picked up" ends up in the record rather than in somebody's memory, so the
 * outcome is a required choice, not a free-text box people leave blank.
 */
export function CompleteTaskDialog({
  task,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  task: CrmTaskRecord | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { outcome: string; outcomeNotes: string | null }) => void;
  isPending?: boolean;
}) {
  const [outcome, setOutcome] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Clear as a new task arrives, during render rather than in an effect.
  //
  // Both sides have to be normalised. `task?.id` is `undefined` when there is
  // no task while the state holds `null`, so comparing them directly is always
  // unequal: the guard re-runs every render, sets the same value, and React
  // gives up with "Too many re-renders". The dialog is mounted by TaskList
  // whenever there are tasks to show, so this took down every page with a task
  // on it — and only those, which is why an empty CRM looked fine.
  const currentTaskId = task?.id ?? null;
  const [seededFor, setSeededFor] = useState<string | null>(currentTaskId);
  if (currentTaskId !== seededFor) {
    setSeededFor(currentTaskId);
    setOutcome("");
    setNotes("");
  }

  const outcomes = task ? outcomesForType(task.type) : [];

  return (
    <Dialog open={Boolean(task)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How did it go?</DialogTitle>
          <DialogDescription>{task?.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Outcome</Label>
            <div className="flex flex-wrap gap-2">
              {outcomes.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOutcome(value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    outcome === value
                      ? "border-[var(--border-strong)] bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                      : "border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]",
                  )}
                >
                  {CRM_TASK_OUTCOME_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outcome-notes">Notes</Label>
            <Textarea
              id="outcome-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything worth remembering next time"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!outcome || isPending}
            onClick={() => onConfirm({ outcome, outcomeNotes: notes.trim() || null })}
          >
            {isPending ? "Saving…" : "Complete task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
