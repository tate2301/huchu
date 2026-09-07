"use client";

import { useState } from "react";

import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { defaultIsTeachingDay } from "../../calendar-kinds";
import type { SchoolsCalendarEventRecord } from "../../admin-v2";

type Kind = SchoolsCalendarEventRecord["kind"];

export const CALENDAR_KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "PUBLIC_HOLIDAY", label: "Public holiday" },
  { value: "HOLIDAY", label: "School holiday" },
  { value: "HALF_TERM", label: "Half term" },
  { value: "STAFF_ONLY", label: "Staff-only day" },
  { value: "EXAM", label: "Examination" },
  { value: "EVENT", label: "Event" },
];

/**
 * What a day of each kind is usually called.
 *
 * The box used to be permanently hinted "Heroes' Day", which is only ever
 * right for one of the six kinds — a registrar entering an exam week was
 * being shown a public holiday. The hint now follows the kind, so it is an
 * example of the thing being entered rather than an example of something else.
 */
const TITLE_HINTS: Record<Kind, string> = {
  PUBLIC_HOLIDAY: "Heroes’ Day",
  HOLIDAY: "December holidays",
  HALF_TERM: "Mid-term break",
  STAFF_ONLY: "Staff development day",
  EXAM: "Form 4 mock examinations",
  EVENT: "Speech and prize giving day",
};

export type CalendarEventFormValues = {
  title: string;
  kind: Kind;
  startDate: string;
  endDate: string;
  isTeachingDay: boolean;
  notes: string;
};

function emptyValues(): CalendarEventFormValues {
  return {
    title: "",
    kind: "PUBLIC_HOLIDAY",
    startDate: "",
    endDate: "",
    isTeachingDay: defaultIsTeachingDay("PUBLIC_HOLIDAY"),
    notes: "",
  };
}

/**
 * Putting a day on the school calendar.
 *
 * The kind drives the open/closed answer, so choosing "Public holiday" flips
 * the switch for you — but the switch stays visible and editable, because a
 * speech day is an event that closes lessons and a Saturday catch-up is a
 * holiday-shaped day the school is open for. The two questions look like one
 * until the first time they disagree.
 */
export function CalendarEventFormSheet({
  open,
  onOpenChange,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: CalendarEventFormValues) => void;
}) {
  const [values, setValues] = useState<CalendarEventFormValues>(emptyValues);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(emptyValues());
  }

  const canSubmit =
    values.title.trim().length > 0 &&
    values.startDate.length > 0 &&
    values.endDate.length > 0 &&
    values.startDate <= values.endDate;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add to the calendar"
      description="Days the school is shut stop showing up as registers nobody took."
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
            {isSubmitting ? "Saving…" : "Add to calendar"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="calendar-title">What is it</Label>
          <Input
            id="calendar-title"
            value={values.title}
            placeholder={TITLE_HINTS[values.kind]}
            maxLength={200}
            onChange={(event) =>
              setValues((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="calendar-kind">Kind</Label>
          <Select
            value={values.kind}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                kind: value as Kind,
                isTeachingDay: defaultIsTeachingDay(value as Kind),
              }))
            }
          >
            <SelectTrigger id="calendar-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALENDAR_KIND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar-start">First day</Label>
          <Input
            id="calendar-start"
            type="date"
            value={values.startDate}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                startDate: event.target.value,
                // A one-day holiday is the common case, so filling the first
                // day fills the last one too rather than making it an error.
                endDate: current.endDate || event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar-end">Last day</Label>
          <Input
            id="calendar-end"
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
              checked={values.isTeachingDay}
              onCheckedChange={(checked) =>
                setValues((current) => ({
                  ...current,
                  isTeachingDay: checked === true,
                }))
              }
            />
            <span>
              The school is open and lessons run
              <span className="block text-muted-foreground">
                Leave this off for a day the school is shut. Turn it on for a
                Saturday exam or a catch-up day, which opens a day that would
                otherwise be closed.
              </span>
            </span>
          </Label>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="calendar-notes">Notes</Label>
          <Textarea
            id="calendar-notes"
            value={values.notes}
            maxLength={500}
            rows={2}
            onChange={(event) =>
              setValues((current) => ({ ...current, notes: event.target.value }))
            }
          />
        </div>
      </div>
    </RecordDialog>
  );
}
