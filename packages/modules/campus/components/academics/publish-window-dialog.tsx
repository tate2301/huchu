"use client";

import { useState } from "react";

import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import type { SchoolsClassRecord, SchoolsTermRecord } from "../../admin-v2";

export type PublishWindowFormValues = {
  termId: string;
  classId: string;
  streamId: string;
  /** `datetime-local` values — "2026-09-14T08:00". */
  openAt: string;
  closeAt: string;
  notes: string;
};

/**
 * The stretch of time in which a term's results may be seen by families.
 *
 * Windows could only be created with a REST client, so in practice results
 * either never reached parents or a developer opened the window by hand. The
 * term is required and the class and stream are not: a school usually opens
 * the whole term at once and narrows only when one year group is behind.
 *
 * `datetime-local` rather than a date: whether a parent can see a report card
 * at four o'clock on the day the head signs it off is exactly the question
 * this record answers, and a date alone cannot say.
 */
export function PublishWindowDialog({
  open,
  onOpenChange,
  terms,
  classes,
  initial,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terms: SchoolsTermRecord[];
  classes: SchoolsClassRecord[];
  /** The window being edited. Absent means the dialog is opening a new one. */
  initial?: PublishWindowFormValues;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: PublishWindowFormValues) => void;
}) {
  const editing = Boolean(initial);
  const empty: PublishWindowFormValues = {
    termId: terms.find((term) => term.isActive)?.id ?? terms[0]?.id ?? "",
    classId: "",
    streamId: "",
    openAt: "",
    closeAt: "",
    notes: "",
  };
  const [values, setValues] = useState<PublishWindowFormValues>(initial ?? empty);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(initial ?? empty);
  }

  const selectedClass = classes.find((row) => row.id === values.classId);
  const streams = selectedClass?.streams ?? [];

  const canSubmit =
    values.termId.length > 0 &&
    values.openAt.length > 0 &&
    values.closeAt.length > 0 &&
    values.openAt < values.closeAt;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit publishing window" : "New publishing window"}
      description="Results are only visible to families while a window covering them is open."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !isSubmitting) onSubmit(values);
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Saving…" : editing ? "Save the window" : "Create window"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="window-term">Term</Label>
          <Select
            value={values.termId}
            disabled={editing}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, termId: value }))
            }
          >
            <SelectTrigger id="window-term">
              <SelectValue placeholder="Choose a term" />
            </SelectTrigger>
            <SelectContent>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name} · {term.academicYear.name}
                  {term.isActive ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="window-class">Class</Label>
          <Select
            value={values.classId || "__all__"}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                classId: value === "__all__" ? "" : value,
                // A stream belongs to one class, so changing the class abandons
                // whatever stream was picked under the old one.
                streamId: "",
              }))
            }
          >
            <SelectTrigger id="window-class">
              <SelectValue placeholder="Every class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Every class</SelectItem>
              {classes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} - {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="window-stream">Stream</Label>
          <Select
            value={values.streamId || "__all__"}
            disabled={!values.classId || streams.length === 0}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                streamId: value === "__all__" ? "" : value,
              }))
            }
          >
            <SelectTrigger id="window-stream">
              <SelectValue placeholder="Every stream" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Every stream</SelectItem>
              {streams.map((stream) => (
                <SelectItem key={stream.id} value={stream.id}>
                  {stream.code} - {stream.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="window-open">Opens</Label>
          <Input
            id="window-open"
            type="datetime-local"
            value={values.openAt}
            onChange={(event) =>
              setValues((current) => ({ ...current, openAt: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="window-close">Closes</Label>
          <Input
            id="window-close"
            type="datetime-local"
            value={values.closeAt}
            onChange={(event) =>
              setValues((current) => ({ ...current, closeAt: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="window-notes">Notes</Label>
          <Textarea
            id="window-notes"
            rows={2}
            maxLength={1000}
            value={values.notes}
            placeholder="Held back until the Form 4 moderation meeting."
            onChange={(event) =>
              setValues((current) => ({ ...current, notes: event.target.value }))
            }
          />
        </div>
      </div>
    </RecordDialog>
  );
}
