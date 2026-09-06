"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button } from "@corelithzw/react";

import { Label } from "@corelithzw/ui/components/label";
import { Input } from "@corelithzw/ui/components/input";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";

/**
 * Opening a register for a class, or moving one onto the right day.
 *
 * Deliberately three fields. The office is not marking a register here — the
 * marks belong to the class teacher and are taken in their portal — it is
 * saying "there should be a register for Form 1B today". A form that asked for
 * thirty-two children's attendance would be the teacher's screen wearing the
 * office's heading, and the office does not know who was there.
 *
 * The stream is offered but never required. A class with no streams has nothing
 * to choose, and a class with three usually keeps one register between them;
 * the school's own uniqueness rule is class + stream + day, so leaving it empty
 * is a real and common answer rather than a missing one.
 */

export type RegisterDraft = {
  classId: string;
  className: string;
  streamId: string;
  streams: Array<{ id: string; code: string; name: string }>;
  attendanceDate: string;
  notes: string;
  /** Set when an existing register is being moved rather than opened. */
  sessionId?: string;
};

export function RegisterFormDialog({
  open,
  onOpenChange,
  draft,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: RegisterDraft;
  isSubmitting: boolean;
  error: unknown;
  onSubmit: (draft: RegisterDraft) => void;
}) {
  const [values, setValues] = useState<RegisterDraft>(draft);

  // Reset during render rather than in an effect: an effect would paint the
  // previous class's date for a frame before clearing it.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(draft);
  }

  // The whole-school list is only needed when the dialog was opened from the
  // app bar with no class in hand; a row already knows which class it is.
  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "register-form"],
    queryFn: () => fetchSchoolsClasses({ limit: 200 }),
    enabled: !draft.classId,
  });

  const classes = useMemo(
    () =>
      [...(classesQuery.data?.data ?? [])].sort(
        (a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name),
      ),
    [classesQuery.data],
  );

  const streams = values.classId
    ? draft.classId === values.classId
      ? draft.streams
      : (classes.find((row) => row.id === values.classId)?.streams ?? [])
    : [];

  const moving = Boolean(draft.sessionId);
  const canSubmit = Boolean(values.classId && values.attendanceDate);

  const set = (patch: Partial<RegisterDraft>) =>
    setValues((current) => ({ ...current, ...patch }));

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={moving ? "Edit the day" : "Open a register"}
      description={
        moving
          ? `Move the ${draft.className} register onto the day it was actually taken.`
          : "The office opens the register; the class teacher marks it from their portal."
      }
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !isSubmitting) onSubmit(values);
      }}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} loading={isSubmitting}>
            {moving ? "Save the day" : "Open the register"}
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert tone="danger" title="The register was not saved">
          {getApiErrorMessage(error)}
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="register-class">Year group</Label>
        {draft.classId ? (
          <p className="text-[length:var(--type-body-sm)] font-semibold">
            {draft.className}
          </p>
        ) : (
          <Select value={values.classId} onValueChange={(value) => set({ classId: value, streamId: "" })}>
            <SelectTrigger id="register-class" className="w-full">
              <SelectValue
                placeholder={classesQuery.isPending ? "Reading the ladder…" : "Choose a year group"}
              />
            </SelectTrigger>
            <SelectContent>
              {classes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {streams.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="register-stream">Stream</Label>
          <Select
            value={values.streamId || "whole"}
            onValueChange={(value) => set({ streamId: value === "whole" ? "" : value })}
          >
            <SelectTrigger id="register-stream" className="w-full">
              <SelectValue placeholder="The whole year group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whole">The whole year group</SelectItem>
              {streams.map((stream) => (
                <SelectItem key={stream.id} value={stream.id}>
                  {stream.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Most schools keep one register for the year group. Choose a stream only where
            they are marked apart.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="register-date">Date</Label>
        <Input
          id="register-date"
          type="date"
          value={values.attendanceDate}
          onChange={(event) => set({ attendanceDate: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="register-notes">Why</Label>
        <Textarea
          id="register-notes"
          rows={2}
          maxLength={500}
          value={values.notes}
          placeholder="Mrs Banda is off sick — opened from the office."
          onChange={(event) => set({ notes: event.target.value })}
        />
        <p className="text-sm text-muted-foreground">
          Optional, and read by whoever comes back to this day later.
        </p>
      </div>
    </RecordDialog>
  );
}
