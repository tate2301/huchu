"use client";

import { useState } from "react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * `Add an update` — appended to the record, never overwriting it.
 *
 * An account, once given, is what somebody said at the time. A school asked
 * about an incident a year later needs the first version as well as the second,
 * which is why there is no edit and no delete on an account anywhere in this
 * module.
 */
export function AddUpdateDialog({
  open,
  onOpenChange,
  pupilName,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pupilName: string;
  isSaving: boolean;
  onSubmit: (values: { body: string; markSeen: boolean }) => void;
}) {
  const [body, setBody] = useState("");
  const [markSeen, setMarkSeen] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBody("");
      setMarkSeen(false);
    }
  }

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Add an update about ${pupilName}`}
      description="Appended to the record. Nothing already written down changes."
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim() && !isSaving) onSubmit({ body: body.trim(), markSeen });
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
          <Button type="submit" disabled={!body.trim() || isSaving}>
            {isSaving ? "Saving…" : "Add it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="update-body">What has happened since</Label>
          <Textarea
            id="update-body"
            value={body}
            rows={5}
            maxLength={4000}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Spoke to Tadiwa and to Tariro Ncube separately."
          />
        </div>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={markSeen}
            onChange={(event) => setMarkSeen(event.target.checked)}
          />
          <span className="text-sm">
            This is my review of it
            <span className="block text-xs text-[color:var(--text-muted)]">
              Stamps the &ldquo;Seen by the head of year&rdquo; step with your name and the time.
            </span>
          </span>
        </label>
      </div>
    </RecordDialog>
  );
}
