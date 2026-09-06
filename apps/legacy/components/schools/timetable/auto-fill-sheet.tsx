"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { DAY_NAMES } from "@/lib/schools/timetable-format";
import type { SchoolsClassRecord } from "@/lib/schools/admin-v2";

export type AutoFillValues = {
  classId: string;
  days: number[];
  periodsPerSubject: number;
};

export type AutoFillResult = {
  placed: number;
  unplaced: Array<{ classSubjectId: string; label: string; wanted: number; placed: number }>;
};

const SCHOOL_DAYS = [1, 2, 3, 4, 5, 6];

/**
 * Building a term's timetable in one go.
 *
 * A school with twelve classes and ten subjects each has 120 lessons to place,
 * every one of which can collide with the class, the teacher or the room.
 * Placing them one at a time is a morning's work, and it is why timetables get
 * built in a spreadsheet and typed in afterwards.
 *
 * The wording is careful about what this does. It is a first-fit starting
 * point, not an optimised timetable — it knows nothing about spreading doubles,
 * protecting Friday afternoon or keeping a teacher's free periods together, and
 * saying otherwise would set an expectation the result cannot meet. What it
 * guarantees is that nothing it places breaks a rule, and that it never moves
 * a lesson somebody placed by hand.
 */
export function AutoFillSheet({
  open,
  onOpenChange,
  classes,
  isSubmitting,
  error,
  result,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: SchoolsClassRecord[];
  isSubmitting: boolean;
  error: string | null;
  result: AutoFillResult | null;
  onSubmit: (values: AutoFillValues) => void;
}) {
  const [values, setValues] = useState<AutoFillValues>({
    classId: "",
    days: [1, 2, 3, 4, 5],
    periodsPerSubject: 1,
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues({ classId: "", days: [1, 2, 3, 4, 5], periodsPerSubject: 1 });
  }

  function toggleDay(day: number) {
    setValues((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((value) => value !== day)
        : [...current.days, day].sort((a, b) => a - b),
    }));
  }

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Build the timetable"
      description="Place every class-subject assignment that has no lesson yet."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button
            disabled={values.days.length === 0 || isSubmitting}
            onClick={() => onSubmit(values)}
          >
            {isSubmitting ? "Building…" : "Build"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not build the timetable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <Alert>
            <AlertTitle>
              {result.placed} lesson{result.placed === 1 ? "" : "s"} placed
            </AlertTitle>
            <AlertDescription>
              {result.unplaced.length === 0 ? (
                <p>Every assignment got the lessons you asked for.</p>
              ) : (
                <>
                  <p>
                    {result.unplaced.length} could not be given a full week —
                    the days and periods available were not enough, or the
                    teacher was already busy in every free slot:
                  </p>
                  <ul>
                    {result.unplaced.slice(0, 8).map((row) => (
                      <li key={row.classSubjectId}>
                        {row.label} — {row.placed} of {row.wanted}
                      </li>
                    ))}
                  </ul>
                  {result.unplaced.length > 8 ? (
                    <p>…and {result.unplaced.length - 8} more.</p>
                  ) : null}
                </>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <Alert>
          <AlertTitle>What this does</AlertTitle>
          <AlertDescription>
            Drops each lesson into the first free slot that clashes with nothing.
            It is a starting point to move things around in, not an optimised
            timetable — and it never moves a lesson you placed yourself.
          </AlertDescription>
        </Alert>

        <FilterSelect
          label="Year group"
          allLabel="Every year group"
          value={values.classId}
          options={classes.map((schoolClass) => ({
            value: schoolClass.id,
            label: schoolClass.name,
          }))}
          onChange={(value) => setValues((current) => ({ ...current, classId: value }))}
          className="w-full"
        />

        <div className="space-y-1.5">
          <Label>Teaching days</Label>
          <div className="flex flex-wrap gap-3">
            {SCHOOL_DAYS.map((day) => (
              <label key={day} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.days.includes(day)}
                  onCheckedChange={() => toggleDay(day)}
                />
                {DAY_NAMES[day]}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="auto-fill-periods">Lessons a week, per subject</Label>
          <Input
            id="auto-fill-periods"
            type="number"
            min={1}
            max={20}
            value={values.periodsPerSubject}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                periodsPerSubject: Math.max(1, Number(event.target.value) || 1),
              }))
            }
          />
        </div>
      </div>
    </RecordDialog>
  );
}
