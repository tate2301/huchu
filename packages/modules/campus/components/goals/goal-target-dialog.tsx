"use client";

import { useState } from "react";
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
import type { SchoolsSubjectRecord } from "../../admin-v2";

export type GoalTargetValues = {
  subjectId: string;
  targetMark: number | null;
  baselineMark: number | null;
  plan: string;
  teacherNote: string;
};

/**
 * Setting a child a target, from the board that named them.
 *
 * The board's whole purpose is the pupils nobody has thought about, so the form
 * is deliberately short: a subject, a number, and the sentence that says how
 * they get there. Anything longer and the two hundred and thirty-eight rows
 * that need one never get one.
 *
 * The subject is a picker rather than free text and it is required, because a
 * target belongs to a subject — `SchoolStudentGoal` is keyed on the three of
 * pupil, term and subject — and "72% overall" is not a thing the mark book can
 * ever compare a result against.
 */
export function GoalTargetDialog({
  open,
  onOpenChange,
  title,
  description,
  subjects,
  defaults,
  submitLabel,
  isSubmitting,
  error,
  progress,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  subjects: SchoolsSubjectRecord[];
  defaults: Partial<GoalTargetValues>;
  /** "Set the target", "Save the target", "Set 238 targets". */
  submitLabel: string;
  isSubmitting: boolean;
  error: string | null;
  /** "41 of 238 written" while a bulk run is going through. */
  progress?: string | null;
  onSubmit: (values: GoalTargetValues) => void;
}) {
  const [values, setValues] = useState<GoalTargetValues>(() => seed(defaults));

  // Reset during render rather than in an effect, the same rule the lesson
  // sheet follows: an effect would paint the previous pupil's target for a
  // frame before clearing it.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(seed(defaults));
  }

  const canSubmit = Boolean(values.subjectId) && values.targetMark !== null;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !isSubmitting) onSubmit(values);
      }}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {progress ? (
            <span className="mr-auto text-[length:var(--type-body-sm)] tabular-nums text-[color:var(--text-muted)]">
              {progress}
            </span>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} loading={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert tone="danger" title="The target was not saved">
          {error}
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="goal-subject">Subject</Label>
        <Select
          value={values.subjectId}
          onValueChange={(value) =>
            setValues((current) => ({ ...current, subjectId: value }))
          }
        >
          <SelectTrigger id="goal-subject" className="w-full">
            <SelectValue placeholder="Choose a subject" />
          </SelectTrigger>
          <SelectContent>
            {subjects.map((subject) => (
              <SelectItem key={subject.id} value={subject.id}>
                {subject.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="goal-target">Target</Label>
          <Input
            id="goal-target"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={values.targetMark ?? ""}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                targetMark: toPercent(event.target.value),
              }))
            }
          />
          <p className="text-sm text-muted-foreground">
            A percentage, so the mark book can compare a result against it.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="goal-baseline">Where they are now</Label>
          <Input
            id="goal-baseline"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={values.baselineMark ?? ""}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                baselineMark: toPercent(event.target.value),
              }))
            }
          />
          <p className="text-sm text-muted-foreground">
            Optional. Recorded once so the distance travelled is still readable
            at the end of the term.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="goal-plan">How they will get there</Label>
        <Textarea
          id="goal-plan"
          rows={3}
          value={values.plan}
          placeholder="Past papers every Tuesday with Mrs Nyathi."
          onChange={(event) =>
            setValues((current) => ({ ...current, plan: event.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="goal-note">The teacher&rsquo;s note</Label>
        <Textarea
          id="goal-note"
          rows={2}
          value={values.teacherNote}
          onChange={(event) =>
            setValues((current) => ({ ...current, teacherNote: event.target.value }))
          }
        />
        <p className="text-sm text-muted-foreground">
          Seen by staff beside the target. The plan is what the child reads.
        </p>
      </div>
    </RecordDialog>
  );
}

function seed(defaults: Partial<GoalTargetValues>): GoalTargetValues {
  return {
    subjectId: defaults.subjectId ?? "",
    targetMark: defaults.targetMark ?? null,
    baselineMark: defaults.baselineMark ?? null,
    plan: defaults.plan ?? "",
    teacherNote: defaults.teacherNote ?? "",
  };
}

/** Empty clears the field rather than reading as zero, which is a real target. */
function toPercent(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  if (Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}
