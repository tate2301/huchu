"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateSchoolsEnrollment,
  type SchoolsClassRecord,
  type SchoolsEnrollmentRecord,
  type SchoolsTermRecord,
} from "@/lib/schools/admin-v2";

/**
 * Putting an enrolment right.
 *
 * Four things can be wrong with one, and the term is the one that goes wrong
 * most: an enrolment is stamped with whichever term was open on the day the
 * office took the application, so a Form 1 intake taken in September for the
 * following January sits in last year's third term. It shows on the class list,
 * it counts in the year roll-up, and before this dialog there was no way to
 * move it.
 *
 * Only what actually changed is sent. The endpoint writes the fields it is
 * given and leaves the rest of the row alone, so a patch that moves a pupil
 * between streams must not also restate their term — that is how an unrelated
 * field gets overwritten with a stale value read off the screen.
 */

const STATUS_CHOICES = [
  { value: "ACTIVE", label: "Active — on the roll" },
  { value: "TRANSFERRED", label: "Transferred — gone to another school" },
  { value: "WITHDRAWN", label: "Withdrawn — taken off the roll" },
  { value: "COMPLETED", label: "Completed — finished the term" },
];

/** Radix will not take an empty string as a value, and "no stream" needs one. */
const NO_STREAM = "none";

export function EnrollmentCorrectionDialog({
  enrollment,
  terms,
  classes,
  open,
  onOpenChange,
  onSaved,
  onError,
}: {
  /** Null while closed. The dialog is keyed on it, so each open starts fresh. */
  enrollment: SchoolsEnrollmentRecord | null;
  terms: SchoolsTermRecord[];
  classes: SchoolsClassRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const [termId, setTermId] = useState(enrollment?.term.id ?? "");
  const [classId, setClassId] = useState(enrollment?.class.id ?? "");
  const [streamId, setStreamId] = useState(enrollment?.stream?.id ?? NO_STREAM);
  const [status, setStatus] = useState(enrollment?.status ?? "ACTIVE");

  // The streams a class has come down with the class itself, so moving a pupil
  // between year groups re-offers the form rooms without another request.
  const streams = classes.find((row) => row.id === classId)?.streams ?? [];

  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!enrollment) return;
      const nextStreamId = streamId === NO_STREAM ? null : streamId;
      const currentStreamId = enrollment.stream?.id ?? null;
      await updateSchoolsEnrollment({
        id: enrollment.id,
        ...(termId !== enrollment.term.id ? { termId } : {}),
        ...(classId !== enrollment.class.id ? { classId } : {}),
        ...(nextStreamId !== currentStreamId ? { streamId: nextStreamId } : {}),
        ...(status !== enrollment.status ? { status } : {}),
      });
    },
    onSuccess: () => onSaved(),
    onError: (error) => onError(error),
  });

  if (!enrollment) return null;

  const pupil = `${enrollment.student.firstName} ${enrollment.student.lastName}`;
  // A stream that belongs to a different class is what the endpoint refuses, so
  // the button says so here rather than letting the save come back 400.
  const streamMismatch =
    streamId !== NO_STREAM && !streams.some((row) => row.id === streamId);
  const changed =
    termId !== enrollment.term.id ||
    classId !== enrollment.class.id ||
    (streamId === NO_STREAM ? null : streamId) !== (enrollment.stream?.id ?? null) ||
    status !== enrollment.status;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Correct ${pupil}'s enrolment`}
      description="Where this pupil sits on the roll for one term. The class list, the register and the year roll-up all read this row."
      size="sm"
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
          <Button
            type="button"
            disabled={!changed || streamMismatch || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save the correction"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="enrolment-term">Term</Label>
          <Select value={termId} onValueChange={setTermId}>
            <SelectTrigger id="enrolment-term">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-[color:var(--text-muted)]">
            An application taken in one term for the next is enrolled into the term that
            was open on the day, which is how a January intake ends up in last year.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="enrolment-class">Year group</Label>
          <Select
            value={classId}
            onValueChange={(value) => {
              setClassId(value);
              // The form rooms belong to the year group. Keeping the old one
              // selected under a new class is the one thing the endpoint
              // refuses, so the field starts again.
              setStreamId(NO_STREAM);
            }}
          >
            <SelectTrigger id="enrolment-class">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {classes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="enrolment-stream">Form room</Label>
          <Select value={streamId} onValueChange={setStreamId}>
            <SelectTrigger id="enrolment-stream">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_STREAM}>None</SelectItem>
              {streams.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {streams.length === 0 ? (
            <p className="text-xs text-[color:var(--text-muted)]">
              This year group has no form rooms, so the pupil sits in the year group
              itself.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="enrolment-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="enrolment-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </RecordDialog>
  );
}
