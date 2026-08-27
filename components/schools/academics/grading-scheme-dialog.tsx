"use client";

import { useState } from "react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type GradingBandDraft = {
  grade: string;
  minScore: string;
  maxScore: string;
  points: string;
  remark: string;
};

export type GradingSchemeFormValues = {
  code: string;
  name: string;
  continuousWeight: string;
  examWeight: string;
  passMark: string;
  isDefault: boolean;
  bands: GradingBandDraft[];
};

/** The A-to-U table most schools here start from, as editable drafts. */
const STARTER_BANDS: GradingBandDraft[] = [
  { grade: "A", minScore: "75", maxScore: "100", points: "1", remark: "Excellent" },
  { grade: "B", minScore: "65", maxScore: "74.99", points: "2", remark: "Very good" },
  { grade: "C", minScore: "50", maxScore: "64.99", points: "3", remark: "Good" },
  { grade: "D", minScore: "40", maxScore: "49.99", points: "4", remark: "Pass" },
  { grade: "E", minScore: "30", maxScore: "39.99", points: "5", remark: "Weak" },
  { grade: "U", minScore: "0", maxScore: "29.99", points: "6", remark: "Ungraded" },
];

const EMPTY: GradingSchemeFormValues = {
  code: "",
  name: "",
  continuousWeight: "30",
  examWeight: "70",
  passMark: "50",
  isDefault: false,
  bands: STARTER_BANDS,
};

/**
 * A marking scheme and its grade table, written together.
 *
 * The two weights are entered side by side and have to add to 100, so the form
 * says what they currently add to rather than waiting for the API to refuse.
 * Bands are inclusive at both ends and may not overlap — a score with two
 * grades is a report card that disagrees with itself — so the maximums stop
 * just short of the next minimum by default.
 */
export function GradingSchemeDialog({
  open,
  onOpenChange,
  initial,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The scheme being edited. Absent means the dialog is opening a new one. */
  initial?: GradingSchemeFormValues;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: GradingSchemeFormValues) => void;
}) {
  const editing = Boolean(initial);
  const [values, setValues] = useState<GradingSchemeFormValues>(initial ?? EMPTY);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(initial ?? EMPTY);
  }

  const weightTotal = Number(values.continuousWeight || 0) + Number(values.examWeight || 0);
  const canSubmit =
    values.code.trim().length > 0 &&
    values.name.trim().length > 0 &&
    weightTotal === 100 &&
    values.bands.every((band) => band.grade.trim().length > 0);

  const setBand = (index: number, patch: Partial<GradingBandDraft>) =>
    setValues((current) => ({
      ...current,
      bands: current.bands.map((band, i) => (i === index ? { ...band, ...patch } : band)),
    }));

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${initial?.name || "grading scheme"}` : "New grading scheme"}
      description="How a term mark is made up, and what each score is called on a report card."
      size="lg"
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
            {isSubmitting ? "Saving…" : editing ? "Save the scheme" : "Create scheme"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="scheme-code">Code</Label>
          <Input
            id="scheme-code"
            value={values.code}
            placeholder="ZIMSEC-O"
            maxLength={40}
            onChange={(event) =>
              setValues((current) => ({ ...current, code: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheme-name">Name</Label>
          <Input
            id="scheme-name"
            value={values.name}
            placeholder="Ordinary Level"
            maxLength={120}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheme-continuous">Class work weight</Label>
          <Input
            id="scheme-continuous"
            type="number"
            min={0}
            max={100}
            value={values.continuousWeight}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                continuousWeight: event.target.value,
                // The pair always adds to 100, so moving one moves the other.
                // The API refuses anything else, and making the office do that
                // arithmetic is a form that argues with you.
                examWeight: String(Math.max(0, 100 - Number(event.target.value || 0))),
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheme-exam">Examination weight</Label>
          <Input
            id="scheme-exam"
            type="number"
            min={0}
            max={100}
            value={values.examWeight}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                examWeight: event.target.value,
                continuousWeight: String(
                  Math.max(0, 100 - Number(event.target.value || 0)),
                ),
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheme-pass">Pass mark</Label>
          <Input
            id="scheme-pass"
            type="number"
            min={0}
            max={100}
            value={values.passMark}
            onChange={(event) =>
              setValues((current) => ({ ...current, passMark: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            Used where the grade table does not say. The two add to {weightTotal}.
          </p>
        </div>
        <div className="space-y-2 self-end">
          <Label className="flex items-start gap-2">
            <Checkbox
              checked={values.isDefault}
              onCheckedChange={(checked) =>
                setValues((current) => ({ ...current, isDefault: checked === true }))
              }
            />
            <span>
              Make this the school&apos;s default
              <span className="block text-muted-foreground">
                Any mark sheet not told otherwise grades against it.
              </span>
            </span>
          </Label>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-section-title">Grade table</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setValues((current) => ({
                ...current,
                bands: [
                  ...current.bands,
                  { grade: "", minScore: "", maxScore: "", points: "", remark: "" },
                ],
              }))
            }
          >
            Add a grade
          </Button>
        </div>
        <div className="space-y-2">
          {values.bands.map((band, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[70px_90px_90px_80px_1fr_auto]">
              <Input
                value={band.grade}
                aria-label={`Grade ${index + 1}`}
                placeholder="A"
                maxLength={10}
                onChange={(event) => setBand(index, { grade: event.target.value })}
              />
              <Input
                type="number"
                value={band.minScore}
                aria-label={`Lowest score for grade ${index + 1}`}
                placeholder="From"
                onChange={(event) => setBand(index, { minScore: event.target.value })}
              />
              <Input
                type="number"
                value={band.maxScore}
                aria-label={`Highest score for grade ${index + 1}`}
                placeholder="To"
                onChange={(event) => setBand(index, { maxScore: event.target.value })}
              />
              <Input
                type="number"
                value={band.points}
                aria-label={`Points for grade ${index + 1}`}
                placeholder="Points"
                onChange={(event) => setBand(index, { points: event.target.value })}
              />
              <Input
                value={band.remark}
                aria-label={`Remark for grade ${index + 1}`}
                placeholder="Excellent"
                maxLength={120}
                onChange={(event) => setBand(index, { remark: event.target.value })}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setValues((current) => ({
                    ...current,
                    bands: current.bands.filter((_, i) => i !== index),
                  }))
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </div>
    </RecordDialog>
  );
}
