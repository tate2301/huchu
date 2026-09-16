"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

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
import { fetchStudentRoll } from "@/lib/schools/students-v2";
import {
  LEAVING_REASON_LABELS,
  recordLeaver,
  type LeavingReason,
} from "@/lib/schools/leavers-v2";

/**
 * `Record a leaver`.
 *
 * Three facts: who, their last day, and why. The five clearance marks are
 * proposed from the records that own them the moment the row is written — the
 * fee ledger, the library, the bed board, the portal and the publish window —
 * so the queue arrives with its work already visible rather than waiting for
 * somebody to check five screens.
 *
 * `lastDay` is the child's last day, which is the date the office is told and
 * not the date somebody got round to recording it.
 */
export function RecordLeaverDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [pupilSearch, setPupilSearch] = useState("");
  const [lastDay, setLastDay] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState<LeavingReason>("COMPLETED_FORM_4");
  const [reasonNote, setReasonNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStudentId("");
      setPupilSearch("");
      setLastDay(new Date().toISOString().slice(0, 10));
      setReason("COMPLETED_FORM_4");
      setReasonNote("");
      setError(null);
    }
  }

  const rollQuery = useQuery({
    queryKey: ["schools", "students", "picker", pupilSearch],
    queryFn: () =>
      fetchStudentRoll({ limit: 25, search: pupilSearch || undefined, status: "ACTIVE" }),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () =>
      recordLeaver({
        studentId,
        lastDay: new Date(lastDay).toISOString(),
        reason,
        reasonNote: reasonNote.trim() || null,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  const canSubmit = studentId.length > 0 && lastDay.length === 10;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record a leaver"
      description="Who is leaving, their last day, and why. The five clearance marks are read off the records that hold them."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !save.isPending) save.mutate();
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
          <Button type="submit" disabled={!canSubmit || save.isPending}>
            {save.isPending ? "Saving…" : "Open the record"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="leaver-pupil-search">Pupil</Label>
          <Input
            id="leaver-pupil-search"
            value={pupilSearch}
            onChange={(event) => setPupilSearch(event.target.value)}
            placeholder="Search name or number"
          />
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger id="leaver-pupil">
              <SelectValue
                placeholder={rollQuery.isPending ? "Reading the roll…" : "Pick a pupil"}
              />
            </SelectTrigger>
            <SelectContent>
              {(rollQuery.data?.data ?? []).map((pupil) => (
                <SelectItem key={pupil.id} value={pupil.id}>
                  {pupil.lastName}, {pupil.firstName} · {pupil.studentNo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="leaver-last-day">Last day</Label>
            <Input
              id="leaver-last-day"
              type="date"
              value={lastDay}
              onChange={(event) => setLastDay(event.target.value)}
            />
            <p className="text-xs text-[color:var(--text-muted)]">
              The child&rsquo;s last day at school, not today.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="leaver-reason">Leaving because</Label>
            <Select value={reason} onValueChange={(next) => setReason(next as LeavingReason)}>
              <SelectTrigger id="leaver-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LEAVING_REASON_LABELS) as LeavingReason[]).map((option) => (
                  <SelectItem key={option} value={option}>
                    {LEAVING_REASON_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="leaver-note">Anything else worth recording</Label>
          <Input
            id="leaver-note"
            value={reasonNote}
            onChange={(event) => setReasonNote(event.target.value)}
            placeholder="Family moving to Bulawayo"
          />
          <p className="text-xs text-[color:var(--text-muted)]">
            Read on a reference years later, so write it as though somebody else will.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
