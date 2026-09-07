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
import { DAY_NAMES, formatMinute } from "../../timetable-format";
import type {
  SchoolsPeriodRecord,
  SchoolsRoomRecord,
  TeacherAssignmentRecord,
} from "../../admin-v2";

export type LessonFormValues = {
  classSubjectId: string;
  periodId: string;
  dayOfWeek: number;
  roomId: string;
};

/**
 * The lesson being moved, when the sheet is opened on an existing one.
 *
 * Only where it sits is editable — day, period, room — which is the same line
 * `PATCH /api/v2/schools/timetable/[id]` draws. Which class, subject and
 * teacher a lesson is belongs to the assignment, and letting the timetable
 * restate it here would give the school two opinions on who teaches what.
 */
export type LessonBeingMoved = {
  id: string;
  /** "Mathematics · Form 2A · Mrs Nyathi" — fixed, and shown rather than offered. */
  describe: string;
  periodId: string;
  dayOfWeek: number;
  roomId: string;
};

function emptyValues(dayOfWeek: number, periodId: string): LessonFormValues {
  return { classSubjectId: "", periodId, dayOfWeek, roomId: "" };
}

/**
 * Putting a lesson on the timetable.
 *
 * The lesson is chosen from the term's existing class-subject assignments
 * rather than by picking a class, a subject and a teacher separately. Those
 * three together *are* an assignment, and offering them as free choices here
 * would let a timetabler schedule a combination the school has not agreed —
 * and give the timetable a second opinion on who teaches what.
 *
 * Non-teaching periods are not offered. Break is on the timetable so it prints,
 * not so lessons can be put in it.
 */
export function LessonFormSheet({
  open,
  onOpenChange,
  assignments,
  periods,
  rooms,
  defaultDayOfWeek,
  defaultPeriodId,
  moving = null,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: TeacherAssignmentRecord[];
  periods: SchoolsPeriodRecord[];
  rooms: SchoolsRoomRecord[];
  defaultDayOfWeek: number;
  defaultPeriodId: string;
  /** Set to move an existing lesson rather than place a new one. */
  moving?: LessonBeingMoved | null;
  isSubmitting: boolean;
  /** The clash sentences from the API, already joined. */
  error: string | null;
  onSubmit: (values: LessonFormValues) => void;
}) {
  const seed = () =>
    moving
      ? {
          classSubjectId: moving.id,
          periodId: moving.periodId,
          dayOfWeek: moving.dayOfWeek,
          roomId: moving.roomId,
        }
      : emptyValues(defaultDayOfWeek, defaultPeriodId);

  const [values, setValues] = useState<LessonFormValues>(seed);

  // Reset during render rather than in an effect: the form is a fresh sheet
  // each time it opens, and an effect would render the previous lesson's
  // choices for one frame first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(seed());
  }

  const teachingPeriods = periods.filter((period) => period.isTeaching);
  const canSubmit = moving
    ? Boolean(values.periodId)
    : Boolean(values.classSubjectId && values.periodId);

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={moving ? "Move the lesson" : "Add a lesson"}
      description={
        moving
          ? "Only where it sits in the week changes. Who teaches it belongs to the assignment."
          : "Choose an existing class-subject assignment and where it sits in the week."
      }
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || isSubmitting}
            onClick={() => onSubmit(values)}
          >
            {isSubmitting
              ? moving
                ? "Moving…"
                : "Adding…"
              : moving
                ? "Move the lesson"
                : "Add lesson"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>That slot is taken</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {moving ? (
          <div className="space-y-1.5">
            <Label htmlFor="lesson-fixed">Lesson</Label>
            <p
              id="lesson-fixed"
              className="rounded-[var(--radius-md)] border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
            >
              {moving.describe}
            </p>
          </div>
        ) : (
        <div className="space-y-1.5">
          <Label htmlFor="lesson-assignment">Lesson</Label>
          <Select
            value={values.classSubjectId}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, classSubjectId: value }))
            }
          >
            <SelectTrigger id="lesson-assignment" className="w-full">
              <SelectValue placeholder="Choose a class and subject" />
            </SelectTrigger>
            <SelectContent>
              {assignments.map((assignment) => (
                <SelectItem key={assignment.id} value={assignment.id}>
                  {[assignment.class.name, assignment.stream?.name]
                    .filter(Boolean)
                    .join(" ")}{" "}
                  · {assignment.subject.name} · {assignment.teacherProfile.user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No class-subject assignments exist for this term yet — nothing to
              place. An assignment is a class, a subject and the teacher who
              takes it: Form 2 Alpha and English Language with Mr Chirwa, or
              Combined Science with Mr Sibanda. Make them on the class&rsquo;s own
              record, or under Teachers, then come back and lay out the week.
            </p>
          ) : null}
        </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lesson-day">Day</Label>
            <Select
              value={String(values.dayOfWeek)}
              onValueChange={(value) =>
                setValues((current) => ({ ...current, dayOfWeek: Number(value) }))
              }
            >
              <SelectTrigger id="lesson-day" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {DAY_NAMES[day]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lesson-period">Period</Label>
            <Select
              value={values.periodId}
              onValueChange={(value) =>
                setValues((current) => ({ ...current, periodId: value }))
              }
            >
              <SelectTrigger id="lesson-period" className="w-full">
                <SelectValue placeholder="Choose a period" />
              </SelectTrigger>
              <SelectContent>
                {teachingPeriods.map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    {period.name} · {formatMinute(period.startMinute)}–
                    {formatMinute(period.endMinute)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lesson-room">Room</Label>
          <Select
            value={values.roomId || "none"}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                roomId: value === "none" ? "" : value,
              }))
            }
          >
            <SelectTrigger id="lesson-room" className="w-full">
              <SelectValue placeholder="No room" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No room</SelectItem>
              {rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                  {room.capacity ? ` · seats ${room.capacity}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {rooms.length === 0
              ? "No rooms are set up. Add them under The School Day — Rm 4, Rm 7, Rm 9, Rm 11, Lab 1, Field — and a clash in one starts being caught."
              : "A school that does not track rooms can leave this empty."}
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
