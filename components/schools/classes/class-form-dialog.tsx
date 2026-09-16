"use client";

import { useMemo, useState } from "react";

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
import {
  CLASS_LADDER,
  FORM_MAX,
  GRADE_MAX,
  classStage,
  levelFor,
  stageOrdinal,
  type ClassStage,
} from "@/lib/schools/class-stage";

export type ClassFormValues = {
  code: string;
  name: string;
  /** The rung on the school-wide ladder, as a string for the form. */
  level: string;
  capacity: string;
};

const EMPTY: ClassFormValues = { code: "", name: "", level: "", capacity: "" };

/**
 * A class, created or corrected — and the stage it is on.
 *
 * ## What was wrong here
 *
 * This dialog asked for "Year group" as a bare number with the helper text
 * "where it sits on the ladder", and shipped six quick presets that put **Form 1
 * at level 1**. `provisionSchool` puts Form 1 at level 8, above the seven
 * Grades, so that one ladder is continuous and `orderBy: { level: "asc" }` — the
 * ordering behind the classes list, the register board, report cards and every
 * fee run — reads top to bottom.
 *
 * Two writers, two incompatible ladders. A combined school that was provisioned
 * and then added a class from this dialog got Form 1 sorting above Grade 1, and
 * no screen it appeared on could say why. The preset codes diverged too — `L5`
 * and `U6` here against `F5` and `F6` there — so the "already on the ladder"
 * guard did not fire and pressing Lower Sixth on a provisioned school created a
 * *second* Form 5 at the wrong rung.
 *
 * ## What it asks now
 *
 * The stage and the year, which is how a school says it — "Form 2", not "rung
 * 9". The level is computed from the pair and still stored in the same column,
 * so nothing downstream changes and no existing tenant moves. The rung number
 * is shown rather than typed, because it is an ordering the school never says
 * out loud and should not have to know.
 */
const STAGE_LABELS: Record<ClassStage, string> = {
  ECD: "ECD",
  GRADE: "Grade",
  FORM: "Form",
};

/** How many years each ladder runs. ECD is a pair sharing one rung. */
const STAGE_YEARS: Record<ClassStage, number> = {
  ECD: 0,
  GRADE: GRADE_MAX,
  FORM: FORM_MAX - GRADE_MAX,
};

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

  /*
   * Stage and year are derived from the stored level rather than held beside
   * it. Two pieces of state for one fact drift the moment a preset writes the
   * level directly, and the level is what the form submits.
   */
  const level = values.level === "" ? null : Number(values.level);
  const stage = classStage(level);
  const ordinal = level == null || stage === "ECD" ? null : stageOrdinal(level);

  const setLevel = (next: number | null) =>
    setValues((current) => ({ ...current, level: next == null ? "" : String(next) }));

  const takenSet = useMemo(
    () => new Set(takenCodes.map((code) => code.toLowerCase())),
    [takenCodes],
  );

  const rungs = useMemo(
    () => ({
      primary: CLASS_LADDER.filter((rung) => rung.stage !== "FORM"),
      secondary: CLASS_LADDER.filter((rung) => rung.stage === "FORM"),
    }),
    [],
  );

  const canSubmit = values.code.trim().length > 0 && values.name.trim().length > 0;

  const presetRow = (label: string, hint: string, list: typeof CLASS_LADDER) => (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {label} <span className="text-[color:var(--text-muted)]">— {hint}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {list.map((rung) => {
          const taken = takenSet.has(rung.code.toLowerCase());
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
                  level: String(rung.level),
                }))
              }
            >
              {rung.name}
            </Button>
          );
        })}
      </div>
    </div>
  );

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${initial?.name || "class"}` : "New class"}
      description="Pupils, registers, mark sheets and fee structures all hang off one."
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
          <div className="space-y-3 sm:col-span-2">
            <Label>Start from</Label>
            {presetRow("Primary", "ECD and the Grades", rungs.primary)}
            {presetRow("Secondary", "the Forms", rungs.secondary)}
            <p className="text-sm text-muted-foreground">
              Fills the code, the name and the stage together. A school that calls
              Form 5 and Form 6 the Lower and Upper Sixth can rename them here —
              the rung underneath stays the same, so they still sort last.
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
          <Label htmlFor="class-stage">Stage</Label>
          <Select
            value={stage ?? ""}
            onValueChange={(next) => {
              const chosen = next as ClassStage;
              // Keep the year where the new ladder has one to keep it at, so
              // switching Grade 4 to a Form lands on Form 4 rather than blank.
              const keep = Math.min(ordinal ?? 1, STAGE_YEARS[chosen] || 1);
              setLevel(levelFor(chosen, chosen === "ECD" ? 0 : keep));
            }}
          >
            <SelectTrigger id="class-stage">
              <SelectValue placeholder="Which ladder" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STAGE_LABELS) as ClassStage[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {STAGE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            A primary runs Grades, a secondary runs Forms, and a combined school
            runs both.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="class-year">Year</Label>
          <Input
            id="class-year"
            type="number"
            min={1}
            max={stage ? STAGE_YEARS[stage] || undefined : undefined}
            // ECD A and ECD B are a pair on one rung, so there is no year to
            // ask for; the two are told apart by their names.
            disabled={stage == null || stage === "ECD"}
            value={ordinal == null ? "" : String(ordinal)}
            placeholder="2"
            onChange={(event) => {
              if (stage == null || stage === "ECD") return;
              const typed = Number(event.target.value);
              if (!Number.isFinite(typed) || typed < 1) {
                setLevel(null);
                return;
              }
              setLevel(levelFor(stage, Math.min(typed, STAGE_YEARS[stage])));
            }}
          />
          <p className="text-sm text-muted-foreground">
            {stage == null
              ? "Pick a stage first."
              : stage === "ECD"
                ? "ECD A and ECD B share a rung and sort above Grade 1."
                : `${STAGE_LABELS[stage]} ${ordinal ?? "—"} sits at rung ${
                    level ?? "—"
                  } of ${FORM_MAX}. Lists and report cards are ordered by it.`}
          </p>
        </div>

        <div className="space-y-2 sm:col-span-2">
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
