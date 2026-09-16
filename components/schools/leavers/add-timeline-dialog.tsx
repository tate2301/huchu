"use client";

import { useState } from "react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * `Add to the timeline`.
 *
 * One sentence, a date, and a reference where there is a document behind it —
 * the reference rather than the file, because the artefact lives in the
 * document pipeline and a second copy here would be a second thing to keep in
 * step.
 */
export function AddTimelineDialog({
  open,
  onOpenChange,
  name,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  isSaving: boolean;
  onSubmit: (values: {
    happenedOn: string;
    summary: string;
    documentReference?: string | null;
  }) => void;
}) {
  const [happenedOn, setHappenedOn] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState("");
  const [reference, setReference] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setHappenedOn(new Date().toISOString().slice(0, 10));
      setSummary("");
      setReference("");
    }
  }

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Add to ${name}'s timeline`}
      description="What happened, and when. One sentence."
      size="sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (summary.trim() && !isSaving) {
          onSubmit({
            happenedOn: new Date(happenedOn).toISOString(),
            summary: summary.trim(),
            documentReference: reference.trim() || null,
          });
        }
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
          <Button type="submit" disabled={!summary.trim() || isSaving}>
            {isSaving ? "Saving…" : "Add it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="timeline-when">When</Label>
          <Input
            id="timeline-when"
            type="date"
            value={happenedOn}
            onChange={(event) => setHappenedOn(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timeline-what">What happened</Label>
          <Input
            id="timeline-what"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Graduated BSc Accounting, University of Zimbabwe"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timeline-reference">Reference</Label>
          <Input
            id="timeline-reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="A letter or a certificate number"
          />
          <p className="text-xs text-[color:var(--text-muted)]">
            A pointer to a document, not the document. The pipeline keeps those.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
