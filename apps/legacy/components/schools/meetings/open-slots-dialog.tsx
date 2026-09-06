"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";


export type OpenSlotsForm = {
  teacherProfileId: string;
  onDate: string;
  startsAt: string;
  endsAt: string;
  minutesEach: number;
  location: string;
};

export type OpenSlotsResult = { created: number; skipped: number };

const SLOT_LENGTHS = [5, 10, 15, 20, 30];

/**
 * Opening one teacher's evening: a window and a slot length.
 *
 * The office is not placing twelve appointments, it is saying "Ms Banda, five
 * to seven, ten minutes each" — so the form asks for the window and does the
 * division. Every slot inside it is created free, and families take them from
 * their own portal.
 *
 * Reopening the same window is safe and the result says so out loud. The
 * backend skips a time it has already opened rather than stacking a second row
 * on it, and an office that pressed the button twice needs to be told "nothing
 * new — those twelve already existed" rather than left wondering whether it
 * has just double-booked the evening.
 */
export function OpenSlotsDialog({
  open,
  onOpenChange,
  teachers,
  defaultDate,
  defaultTeacherProfileId,
  isSubmitting,
  error,
  result,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teachers: Array<{ id: string; name: string }>;
  defaultDate: string;
  /** Prefilled from the screen's teacher filter, when one is set. */
  defaultTeacherProfileId?: string;
  isSubmitting: boolean;
  error: string | null;
  result: OpenSlotsResult | null;
  onSubmit: (form: OpenSlotsForm) => void;
}) {
  const [values, setValues] = useState<OpenSlotsForm>({
    teacherProfileId: defaultTeacherProfileId ?? "",
    onDate: defaultDate,
    startsAt: "17:00",
    endsAt: "19:00",
    minutesEach: 10,
    location: "",
  });

  const set = (patch: Partial<OpenSlotsForm>) =>
    setValues((current) => ({ ...current, ...patch }));

  const minutes =
    values.onDate && values.startsAt && values.endsAt
      ? (new Date(`${values.onDate}T${values.endsAt}`).getTime() -
          new Date(`${values.onDate}T${values.startsAt}`).getTime()) /
        60000
      : 0;
  const count = minutes > 0 ? Math.floor(minutes / values.minutesEach) : 0;
  const ready = Boolean(values.teacherProfileId && values.onDate) && count > 0;

  const teacherName = teachers.find((row) => row.id === values.teacherProfileId)?.name;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open slots"
      description="Create a teacher's parents' evening as a row per free ten minutes."
      footer={
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <p className="flex-1 text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
            {ready ? (
              <>
                <span className="tabular-nums">{count}</span> slot
                {count === 1 ? "" : "s"} of{" "}
                <span className="tabular-nums">{values.minutesEach}</span> minutes
              </>
            ) : (
              "Pick a teacher, a date, and a window longer than one slot"
            )}
          </p>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button disabled={!ready || isSubmitting} onClick={() => onSubmit(values)}>
            {isSubmitting ? "Opening…" : "Open the slots"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not open the slots</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <Alert>
            <AlertTitle>
              {result.created === 0
                ? "Nothing new to open"
                : `${result.created} slot${result.created === 1 ? "" : "s"} opened`}
            </AlertTitle>
            <AlertDescription>
              {result.created === 0 ? (
                <p>
                  All {result.skipped} slot{result.skipped === 1 ? "" : "s"} in that
                  window already exist for {teacherName ?? "this teacher"} — nothing was
                  duplicated, and the bookings already on them are untouched.
                </p>
              ) : result.skipped > 0 ? (
                <p>
                  {result.skipped} of the {result.created + result.skipped} times in the
                  window already had a slot on them and were left alone.
                </p>
              ) : (
                <p>
                  Every slot in the window is free and families can book them from their
                  portal now.
                </p>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        {/*
          A `Select` of its own rather than the screen's `FilterSelect`: that
          derives its input id from its label, and the page behind this dialog
          already has a "Teacher" filter — two elements sharing an id break the
          label association on both.
        */}
        <div className="space-y-1.5">
          <Label htmlFor="open-slots-teacher">Teacher</Label>
          <Select
            value={values.teacherProfileId}
            onValueChange={(value) => set({ teacherProfileId: value })}
          >
            <SelectTrigger id="open-slots-teacher" className="w-full">
              <SelectValue placeholder="Choose a teacher" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="open-slots-date">Date</Label>
            <Input
              id="open-slots-date"
              type="date"
              value={values.onDate}
              onChange={(event) => set({ onDate: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="open-slots-length">Slot length</Label>
            <Select
              value={String(values.minutesEach)}
              onValueChange={(value) => set({ minutesEach: Number(value) })}
            >
              <SelectTrigger id="open-slots-length" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_LENGTHS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="open-slots-from">From</Label>
            <Input
              id="open-slots-from"
              type="time"
              value={values.startsAt}
              onChange={(event) => set({ startsAt: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="open-slots-to">To</Label>
            <Input
              id="open-slots-to"
              type="time"
              value={values.endsAt}
              onChange={(event) => set({ endsAt: event.target.value })}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="open-slots-where">Where</Label>
            <Input
              id="open-slots-where"
              value={values.location}
              placeholder="Room 4, the hall, the science lab"
              onChange={(event) => set({ location: event.target.value })}
            />
            <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              Shown to families when they book. Optional.
            </p>
          </div>
        </div>
      </div>
    </RecordDialog>
  );
}
