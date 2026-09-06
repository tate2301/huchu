"use client";

import { useState } from "react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";

export type ClassFormValues = {
  code: string;
  name: string;
  level: string;
  capacity: string;
};

const EMPTY: ClassFormValues = { code: "", name: "", level: "", capacity: "" };

/**
 * The secondary ladder as it is actually named here.
 *
 * Not specimen data: Form 1 through Form 4 then Lower Sixth and Upper Sixth is
 * the Zimbabwean secondary school, and the level numbers behind those names are
 * the thing everybody gets wrong by hand — the two sixths are levels 5 and 6
 * and sort after Form 4, which typing "Lower Sixth" into a free-text box does
 * not tell anyone. Pressing one fills the code, the name and the level
 * together; the places count stays the school’s own.
 */
const LADDER = [
  { code: "F1", name: "Form 1", level: "1" },
  { code: "F2", name: "Form 2", level: "2" },
  { code: "F3", name: "Form 3", level: "3" },
  { code: "F4", name: "Form 4", level: "4" },
  { code: "L5", name: "Lower Sixth", level: "5" },
  { code: "U6", name: "Upper Sixth", level: "6" },
];

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
  takenCodes = [],
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The class being edited. Absent means the dialog is opening a new one. */
  initial?: ClassFormValues;
  /** Codes already on the ladder, so a preset that would collide is off. */
  takenCodes?: string[];
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
        {/* Only when creating. Pressing "Form 3" over an existing class would
            rename the wrong row and move it up the ladder with its pupils. */}
        {editing ? null : (
          <div className="space-y-2 sm:col-span-2">
            <Label>Start from</Label>
            <div className="flex flex-wrap gap-2">
              {LADDER.map((rung) => {
                const taken = takenCodes.some(
                  (code) => code.toLowerCase() === rung.code.toLowerCase(),
                );
                return (
                  <Button
                    key={rung.code}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={taken}
                    title={taken ? `${rung.name} is already on the ladder.` : undefined}
                    onClick={() =>
                      setValues((current) => ({
                        ...current,
                        code: rung.code,
                        name: rung.name,
                        level: rung.level,
                      }))
                    }
                  >
                    {rung.name}
                  </Button>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              Fills the code, the name and where it sits on the ladder.
            </p>
          </div>
        )}
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
