"use client";

import { useState } from "react";

import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { RecordDialog } from "@/components/crm/records/record-dialog";

export type AcademicYearFormValues = {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

const EMPTY: AcademicYearFormValues = {
  code: "",
  name: "",
  startDate: "",
  endDate: "",
  isActive: true,
};

/**
 * Opening an academic year.
 *
 * The fields stack on a phone and pair up from `sm`, because a date pair read
 * side by side on a narrow screen is two inputs too small to tap accurately.
 */
export function AcademicYearFormSheet({
  open,
  onOpenChange,
  initial,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The year being edited. Absent means the dialog is opening a new one. */
  initial?: AcademicYearFormValues;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: AcademicYearFormValues) => void;
}) {
  const editing = Boolean(initial);
  const [values, setValues] = useState<AcademicYearFormValues>(initial ?? EMPTY);

  // Reset while rendering rather than in an effect: opening the dialog is a
  // prop change we can respond to directly, and an effect here would render the
  // previous submission's values once before clearing them.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(initial ?? EMPTY);
  }

  const canSubmit =
    values.code.trim().length > 0 &&
    values.name.trim().length > 0 &&
    values.startDate.length > 0 &&
    values.endDate.length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${initial?.name || "academic year"}` : "New academic year"}
      description="The enclosing period that terms, classes and enrolment belong to."
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
            {isSubmitting
              ? "Saving…"
              : editing
                ? "Save the academic year"
                : "Create academic year"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="year-code">Code</Label>
          <Input
            id="year-code"
            value={values.code}
            placeholder="2026"
            maxLength={40}
            onChange={(event) =>
              setValues((current) => ({ ...current, code: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="year-name">Name</Label>
          <Input
            id="year-name"
            value={values.name}
            placeholder="2026 Academic Year"
            maxLength={120}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="year-start">Starts</Label>
          <Input
            id="year-start"
            type="date"
            value={values.startDate}
            onChange={(event) =>
              setValues((current) => ({ ...current, startDate: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="year-end">Ends</Label>
          <Input
            id="year-end"
            type="date"
            value={values.endDate}
            onChange={(event) =>
              setValues((current) => ({ ...current, endDate: event.target.value }))
            }
          />
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
              Make this the current academic year
              <span className="block text-muted-foreground">
                The school can only have one current year. The previous one stands down.
              </span>
            </span>
          </Label>
        </div>
      </div>
    </RecordDialog>
  );
}
