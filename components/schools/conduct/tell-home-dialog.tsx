"use client";

import { useState } from "react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IncidentRow } from "@/lib/schools/conduct-v2";

/**
 * `Tell home`.
 *
 * It records that somebody rang. It does not ring anybody, and the wording says
 * so — a product that claimed to have told a parent when it had only stamped a
 * row would be worse than the blank cell it replaced.
 *
 * The channel is free text with three presets, because "telephone, then portal
 * notice" is what actually happened often enough to be worth typing.
 */

const PRESETS = ["Phone call", "Portal notice", "Message to the family", "Spoke at pick-up"];

export function TellHomeDialog({
  incident,
  onOpenChange,
  isSaving,
  onConfirm,
}: {
  /** The incident being recorded against. Null closes the dialog. */
  incident: IncidentRow | null;
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  onConfirm: (channel: string) => void;
}) {
  const [channel, setChannel] = useState("Phone call");

  const open = Boolean(incident);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChannel("Phone call");
  }

  const pupil = incident ? `${incident.student.firstName} ${incident.student.lastName}` : "";

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Record that home was told about ${pupil}`}
      description="This writes down what you did. It does not send anything."
      size="sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (channel.trim() && !isSaving) onConfirm(channel.trim());
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!channel.trim() || isSaving}>
            {isSaving ? "Saving…" : "Record it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tell-home-channel">How they were told</Label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={channel === preset ? "default" : "outline"}
                onClick={() => setChannel(preset)}
              >
                {preset}
              </Button>
            ))}
          </div>
          <Input
            id="tell-home-channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            placeholder="telephone, then portal notice"
          />
        </div>
        {/* Said before it is saved, because it cannot be unsaid: the school's
            record of what a parent was told has to still be true a year later. */}
        <p className="text-xs text-[color:var(--text-muted)]">
          Once this is recorded it cannot be rewritten. Add an update on the record if what was
          said changes.
        </p>
      </div>
    </RecordDialog>
  );
}
