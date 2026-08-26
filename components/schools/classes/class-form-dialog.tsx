"use client";

import { useState } from "react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ClassFormValues = {
  code: string;
  name: string;
  level: string;
  capacity: string;
};

const EMPTY: ClassFormValues = { code: "", name: "", level: "", capacity: "" };

/**
 * A year group, created or corrected.
 *
 * `level` is the ladder's ordering rather than the name, and it is asked for
 * separately because the two genuinely differ: a school running ECD, seven
 * Grades and four Forms has "Form 1" at level 8, and sorting the list by the
 * name would put Form 10 between Form 1 and Form 2.
 */
export function ClassFormDialog({
  open,
  onOpenChange,
  initial,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The class being edited. Absent means the dialog is opening a new one. */
  initial?: ClassFormValues;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: ClassFormValues) => void;
}) {
  const editing = Boolean(initial);
  const [values, setValues] = useState<ClassFormValues>(initial ?? EMPTY);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(initial ?? EMPTY);
  }

  const canSubmit = values.code.trim().length > 0 && values.name.trim().length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${initial?.name || "class"}` : "New class"}
      description="A year group. Pupils, registers, mark sheets and fee structures all hang off one."
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
            {isSubmitting ? "Saving…" : editing ? "Save the class" : "Create class"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="class-code">Code</Label>
          <Input
            id="class-code"
            value={values.code}
            placeholder="F2"
            maxLength={40}
            onChange={(event) =>
              setValues((current) => ({ ...current, code: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="class-name">Name</Label>
          <Input
            id="class-name"
            value={values.name}
            placeholder="Form 2"
            maxLength={120}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="class-level">Year group</Label>
          <Input
            id="class-level"
            type="number"
            min={0}
            value={values.level}
            placeholder="2"
            onChange={(event) =>
              setValues((current) => ({ ...current, level: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            Where it sits on the ladder. Lists and report cards are ordered by it.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="class-capacity">Places</Label>
          <Input
            id="class-capacity"
            type="number"
            min={1}
            value={values.capacity}
            placeholder="120"
            onChange={(event) =>
              setValues((current) => ({ ...current, capacity: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            What admissions counts a place against. Leave blank for no limit.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
