"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const COMMON_REASONS = [
  "Price too high",
  "Went with a competitor",
  "Project postponed",
  "Budget withdrawn",
  "No response",
  "Out of our scope",
];

/**
 * Asked for whenever a lead is moved to Lost — from the board, the table, or
 * the detail page. Losing deals without recording why is how a pipeline stops
 * teaching you anything.
 */
export function LostReasonDialog({
  open,
  leadLabel,
  count,
  onCancel,
  onConfirm,
  isPending,
}: {
  open: boolean;
  leadLabel?: string;
  count?: number;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  isPending?: boolean;
}) {
  const [reason, setReason] = useState("");
  // Clear the box each time the dialog opens, adjusting state during render
  // rather than in an effect so there's no flash of the previous reason.
  // Starts at `false`, not `open`: a sheet that mounts already open would
  // otherwise record itself as having always been open, the transition below
  // would never fire, and the form would never seed.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  const subject =
    count && count > 1 ? `${count} leads` : leadLabel ? `"${leadLabel}"` : "this lead";

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {subject} as lost</DialogTitle>
          <DialogDescription>
            Recording why keeps the pipeline honest and shows up in source
            reporting later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {COMMON_REASONS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={reason === preset ? "default" : "outline"}
                onClick={() => setReason(preset)}
              >
                {preset}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lost-reason">Reason</Label>
            <Textarea
              id="lost-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What made them walk away?"
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={isPending || reason.trim().length === 0}
          >
            {isPending ? "Saving…" : "Mark as lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
