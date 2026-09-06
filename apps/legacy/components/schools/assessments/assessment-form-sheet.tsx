"use client";

import { useState } from "react";

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
import { RecordDialog } from "@/components/crm/records/record-dialog";
import {
  ASSESSMENT_KIND_LABELS,
  type AssessmentKind,
  type ClassSubjectOption,
} from "@/lib/schools/assessments-v2";

export type AssessmentFormValues = {
  classSubjectId: string;
  kind: AssessmentKind;
  title: string;
  maxScore: string;
  weight: string;
  assessedOn: string;
};

function emptyValues(defaultSubjectId: string): AssessmentFormValues {
  return {
    classSubjectId: defaultSubjectId,
    kind: "CONTINUOUS",
    title: "",
    maxScore: "100",
    weight: "1",
    assessedOn: "",
  };
}

/**
 * Setting a piece of work that carries marks.
 *
 * Subject first, because that is what the teacher is thinking about, and the
 * assignment it resolves to already knows the class and who teaches it.
 *
 * "Out of" and "counts as" are separate fields because they are separate
 * facts: a test out of 20 that counts double is normal, and collapsing them
 * into one number is how a school ends up scaling marks by hand in a
 * spreadsheet.
 */
export function AssessmentFormSheet({
  open,
  onOpenChange,
  subjects,
  defaultClassSubjectId,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: ClassSubjectOption[];
  defaultClassSubjectId?: string;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: AssessmentFormValues) => void;
}) {
  const fallback = defaultClassSubjectId ?? subjects[0]?.id ?? "";
  const [values, setValues] = useState<AssessmentFormValues>(() =>
    emptyValues(fallback),
  );

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(emptyValues(fallback));
  }

  const maxScore = Number(values.maxScore);
  const weight = Number(values.weight);
  const canSubmit =
    values.classSubjectId.length > 0 &&
    values.title.trim().length > 0 &&
    Number.isFinite(maxScore) &&
    maxScore > 0 &&
    Number.isFinite(weight) &&
    weight > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New assessment"
      description="A test, a practical or the exam. Marks are entered against it afterwards."
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
            {isSubmitting ? "Creating…" : "Create"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="assessment-subject">Subject</Label>
          <Select
            value={values.classSubjectId}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, classSubjectId: value }))
            }
          >
            <SelectTrigger id="assessment-subject">
              <SelectValue placeholder="Choose a subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.subject.name}
                  {option.stream ? ` — ${option.stream.name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="assessment-title">What is it</Label>
          <Input
            id="assessment-title"
            value={values.title}
            placeholder="Mid-term test"
            maxLength={200}
            onChange={(event) =>
              setValues((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessment-kind">Kind</Label>
          <Select
            value={values.kind}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, kind: value as AssessmentKind }))
            }
          >
            <SelectTrigger id="assessment-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ASSESSMENT_KIND_LABELS) as AssessmentKind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {ASSESSMENT_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessment-date">Sat on</Label>
          <Input
            id="assessment-date"
            type="date"
            value={values.assessedOn}
            onChange={(event) =>
              setValues((current) => ({ ...current, assessedOn: event.target.value }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessment-max">Out of</Label>
          <Input
            id="assessment-max"
            type="number"
            min={1}
            max={1000}
            value={values.maxScore}
            onChange={(event) =>
              setValues((current) => ({ ...current, maxScore: event.target.value }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessment-weight">Counts as</Label>
          <Input
            id="assessment-weight"
            type="number"
            min={0.5}
            step={0.5}
            max={100}
            value={values.weight}
            onChange={(event) =>
              setValues((current) => ({ ...current, weight: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            Relative to other work of the same kind. A 2 counts twice as much as a 1.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
