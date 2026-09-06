"use client";

import { useState } from "react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";

export type SubjectFormValues = {
  code: string;
  name: string;
  isCore: boolean;
  passMark: string;
  isActive: boolean;
};

const EMPTY: SubjectFormValues = {
  code: "",
  name: "",
  isCore: true,
  passMark: "50",
  isActive: true,
};

/**
 * A subject on the catalogue, created or corrected.
 *
 * The module carried two different create dialogs for this and neither could
 * edit; this is the one, and it is the only place the catalogue is written.
 *
 * The pass mark is the field on this form worth being careful with: it is what
 * a score is compared against to decide a pass, so changing it re-reads every
 * mark already recorded against the subject. Left as a number rather than a
 * choice because schools genuinely differ — 40 and 50 are both normal here.
 */
export function SubjectFormDialog({
  open,
  onOpenChange,
  initial,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The subject being edited. Absent means the dialog is opening a new one. */
  initial?: SubjectFormValues;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: SubjectFormValues) => void;
}) {
  const editing = Boolean(initial);
  const [values, setValues] = useState<SubjectFormValues>(initial ?? EMPTY);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(initial ?? EMPTY);
  }

  const passMark = Number(values.passMark);
  const canSubmit =
    values.code.trim().length > 0 &&
    values.name.trim().length > 0 &&
    Number.isFinite(passMark) &&
    passMark >= 0 &&
    passMark <= 100;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${initial?.name || "subject"}` : "New subject"}
      description="What the school teaches. Timetable slots, mark sheets and report cards all name one."
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
            {isSubmitting ? "Saving…" : editing ? "Save the subject" : "Create subject"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="subject-code">Code</Label>
          <Input
            id="subject-code"
            value={values.code}
            placeholder="MAT"
            maxLength={40}
            onChange={(event) =>
              setValues((current) => ({ ...current, code: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subject-name">Name</Label>
          <Input
            id="subject-name"
            value={values.name}
            placeholder="Mathematics"
            maxLength={120}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subject-pass">Pass mark</Label>
          <Input
            id="subject-pass"
            type="number"
            min={0}
            max={100}
            value={values.passMark}
            onChange={(event) =>
              setValues((current) => ({ ...current, passMark: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            The score a mark is compared against to decide a pass.
          </p>
        </div>
        <div className="space-y-2 self-end">
          <Label className="flex items-start gap-2">
            <Checkbox
              checked={values.isCore}
              onCheckedChange={(checked) =>
                setValues((current) => ({ ...current, isCore: checked === true }))
              }
            />
            <span>
              Everybody takes it
              <span className="block text-muted-foreground">
                Off, it is an elective a pupil opts into.
              </span>
            </span>
          </Label>
        </div>
        <div className="sm:col-span-2">
          <Label className="flex items-start gap-2">
            <Checkbox
              checked={values.isActive}
              onCheckedChange={(checked) =>
                setValues((current) => ({ ...current, isActive: checked === true }))
              }
            />
            <span>
              Currently taught
              <span className="block text-muted-foreground">
                Retiring a subject keeps every mark already recorded against it and
                stops it appearing on new timetables and mark sheets.
              </span>
            </span>
          </Label>
        </div>
      </div>
    </RecordDialog>
  );
}
