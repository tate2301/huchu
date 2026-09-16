"use client";

import { useState } from "react";
import { Badge } from "@/components/schools/common/status-badge";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLEARANCE_LABELS,
  type ClearanceKind,
  type LeaverRow,
} from "@/lib/schools/leavers-v2";

/**
 * Settling one of the five marks.
 *
 * The evidence the derivation found is shown first — `$210.00 on INV-2026-0509`,
 * `2 books out` — because the decision being made is "settle it" or "override
 * it", and an override without the evidence in front of the person making it is
 * a click.
 *
 * Marking a mark done **against** its evidence asks for a reason. That is the
 * head waiving a fee or writing a book off, and it is the one thing on this
 * screen somebody will be asked about a year later.
 */
export function ClearanceDialog({
  target,
  onOpenChange,
  isSaving,
  onSubmit,
}: {
  /** Null closes the dialog. */
  target: { leaver: LeaverRow; kind: ClearanceKind } | null;
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  onSubmit: (values: {
    state: "TODO" | "DONE" | "NOT_APPLICABLE";
    overrideNote: string | null;
  }) => void;
}) {
  const open = target != null;
  const [note, setNote] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setNote("");
  }

  const mark = target
    ? target.leaver.clearances.find((entry) => entry.kind === target.kind)
    : null;
  const outstanding = mark?.state === "TODO";
  const needsReason = outstanding && Boolean(mark?.detail) && mark?.detail !== "Nothing owed";

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        target
          ? `${CLEARANCE_LABELS[target.kind]} — ${target.leaver.student.firstName} ${target.leaver.student.lastName}`
          : "Clearance"
      }
      description="What the records say, and what you are deciding."
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Leave it open
          </Button>
          <Button
            type="button"
            disabled={isSaving || (needsReason && !note.trim())}
            onClick={() => onSubmit({ state: "DONE", overrideNote: note.trim() || null })}
          >
            {isSaving ? "Saving…" : "Mark it done"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge tone={outstanding ? "warn" : "success"}>
            {mark?.state === "DONE"
              ? "Settled"
              : mark?.state === "NOT_APPLICABLE"
                ? "Does not apply"
                : "Outstanding"}
          </Badge>
          <span className="text-sm">{mark?.detail ?? "Nothing recorded"}</span>
        </div>

        {needsReason ? (
          <div className="space-y-2">
            <Label htmlFor="clearance-note">Why it is being cleared anyway</Label>
            <Input
              id="clearance-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Waived by the head — hardship"
            />
            <p className="text-xs text-[color:var(--text-muted)]">
              The record still says what was owed. This is what somebody reads when they ask why
              it closed.
            </p>
          </div>
        ) : (
          <p className="text-xs text-[color:var(--text-muted)]">
            Nothing is outstanding on this one, so no reason is needed.
          </p>
        )}

        {target?.kind === "BOARDING" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={() => onSubmit({ state: "NOT_APPLICABLE", overrideNote: null })}
          >
            They are a day pupil — it does not apply
          </Button>
        ) : null}
      </div>
    </RecordDialog>
  );
}
