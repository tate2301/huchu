"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import type { SchoolsTermRecord } from "../../admin-v2";

export type CopyForwardValues = {
  fromTermId: string;
  toTermId: string;
};

export type CopyForwardResult = {
  copied: number;
  skippedNoAssignment: number;
  skippedClash: number;
};

/**
 * Copying a term's timetable into another term.
 *
 * A school's timetable is largely stable across terms, and rebuilding it by
 * hand each time is the reason school timetables end up living in a
 * spreadsheet.
 *
 * The result is reported rather than announced as a success. A copy that moved
 * 40 lessons and quietly skipped 12 is not the same event as one that moved 52,
 * and the timetabler needs to know which lessons the new term has no assignment
 * for before they discover it in week one.
 */
export function CopyForwardSheet({
  open,
  onOpenChange,
  terms,
  currentTermId,
  isSubmitting,
  error,
  result,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terms: SchoolsTermRecord[];
  currentTermId: string | null;
  isSubmitting: boolean;
  error: string | null;
  result: CopyForwardResult | null;
  onSubmit: (values: CopyForwardValues) => void;
}) {
  const [values, setValues] = useState<CopyForwardValues>({
    fromTermId: currentTermId ?? "",
    toTermId: "",
  });

  // Render-phase reset, so reopening the sheet does not show the previous run's
  // choices for a frame first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues({ fromTermId: currentTermId ?? "", toTermId: "" });
  }

  const canSubmit =
    Boolean(values.fromTermId) &&
    Boolean(values.toTermId) &&
    values.fromTermId !== values.toTermId;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Copy the timetable forward"
      description="Copy every lesson from one term into another."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button disabled={!canSubmit || isSubmitting} onClick={() => onSubmit(values)}>
            {isSubmitting ? "Copying…" : "Copy"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not copy the timetable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <Alert>
            <AlertTitle>
              {result.copied} lesson{result.copied === 1 ? "" : "s"} copied
            </AlertTitle>
            <AlertDescription>
              {result.skippedNoAssignment > 0 ? (
                <p>
                  {result.skippedNoAssignment} skipped because the target term has no
                  matching class-subject assignment. Create those under Teachers, then
                  copy again — nothing already copied will be duplicated.
                </p>
              ) : null}
              {result.skippedClash > 0 ? (
                <p>
                  {result.skippedClash} skipped because the slot was already taken in
                  the target term.
                </p>
              ) : null}
              {result.skippedNoAssignment === 0 && result.skippedClash === 0 ? (
                <p>Every lesson carried over.</p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="copy-from">Copy from</Label>
          <Select
            value={values.fromTermId}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, fromTermId: value }))
            }
          >
            <SelectTrigger id="copy-from" className="w-full">
              <SelectValue placeholder="Choose a term" />
            </SelectTrigger>
            <SelectContent>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.academicYear.code} · {term.name}
                  {term.isActive ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="copy-to">Copy into</Label>
          <Select
            value={values.toTermId}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, toTermId: value }))
            }
          >
            <SelectTrigger id="copy-to" className="w-full">
              <SelectValue placeholder="Choose a term" />
            </SelectTrigger>
            <SelectContent>
              {terms
                .filter((term) => term.id !== values.fromTermId)
                .map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.academicYear.code} · {term.name}
                    {term.isActive ? " (current)" : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground">
          This adds to the target term. Lessons already there are left alone, so
          running it twice does not duplicate anything.
        </p>
      </div>
    </RecordDialog>
  );
}
