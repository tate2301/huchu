"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  DESTINATION_LABELS,
  recordDestination,
  type AlumnusRow,
  type DestinationKind,
} from "@/lib/schools/leavers-v2";

/**
 * `Where did they go?`
 *
 * A kind and a place, and the save stamps when it was confirmed. That date is
 * the point: a destination with no date is a rumour, and a register full of
 * undated destinations is one nobody trusts enough to write to.
 */
export function DestinationDialog({
  alumnus,
  onOpenChange,
  onSaved,
}: {
  /** Null closes the dialog. */
  alumnus: AlumnusRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const open = alumnus != null;
  const [kind, setKind] = useState<DestinationKind>("UNIVERSITY");
  const [place, setPlace] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && alumnus) {
      setKind(alumnus.destinationKind === "UNKNOWN" ? "UNIVERSITY" : alumnus.destinationKind);
      setPlace(alumnus.destination ?? "");
      setError(null);
    }
  }

  const save = useMutation({
    mutationFn: () =>
      recordDestination(alumnus!.id, { destinationKind: kind, destination: place.trim() || null }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={alumnus ? `Where did ${alumnus.firstName} go?` : "Where did they go?"}
      description="What they are doing now, and where. Saving stamps today as the date it was confirmed."
      size="sm"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Record it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="destination-kind">What they are doing</Label>
          <Select value={kind} onValueChange={(next) => setKind(next as DestinationKind)}>
            <SelectTrigger id="destination-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DESTINATION_LABELS) as DestinationKind[]).map((option) => (
                <SelectItem key={option} value={option}>
                  {DESTINATION_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="destination-place">Where</Label>
          <Input
            id="destination-place"
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            placeholder="University of Zimbabwe · BSc Accounting"
          />
          <p className="text-xs text-[color:var(--text-muted)]">
            As specific as somebody actually told you. &ldquo;Harare&rdquo; is worth more than
            nothing and less than a course.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
