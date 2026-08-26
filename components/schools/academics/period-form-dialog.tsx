"use client";

import { useState } from "react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SchoolsTermRecord } from "@/lib/schools/admin-v2";

export type PeriodFormValues = {
  code: string;
  name: string;
  /** "07:30" — parsed to minutes from midnight on the way to the API. */
  startsAt: string;
  endsAt: string;
  sequence: string;
  isTeaching: boolean;
  /** Empty means the period applies to every term. */
  termId: string;
};

const EMPTY: PeriodFormValues = {
  code: "",
  name: "",
  startsAt: "",
  endsAt: "",
  sequence: "",
  isTeaching: true,
  termId: "",
};

/**
 * A period in the school day.
 *
 * Times are typed as wall-clock "07:30" and sent as minutes from midnight,
 * which is what the column holds — a period is a fact about the shape of a
 * day, not an instant, so it has no date and no timezone.
 *
 * Break, assembly and lunch are periods too, with the teaching switch off:
 * the timetable needs them to lay the grid out, and refuses to schedule a
 * lesson in one.
 */
export function PeriodFormDialog({
  open,
  onOpenChange,
  terms,
  initial,
  nextSequence,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terms: SchoolsTermRecord[];
  /** The period being edited. Absent means the dialog is opening a new one. */
  initial?: PeriodFormValues;
  /** Where a new period lands in the day, so the office rarely retypes it. */
  nextSequence: number;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: PeriodFormValues) => void;
}) {
  const editing = Boolean(initial);
  const empty: PeriodFormValues = { ...EMPTY, sequence: String(nextSequence) };
  const [values, setValues] = useState<PeriodFormValues>(initial ?? empty);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(initial ?? empty);
  }

  const canSubmit =
    values.code.trim().length > 0 &&
    values.name.trim().length > 0 &&
    /^\d{1,2}:\d{2}$/.test(values.startsAt) &&
    /^\d{1,2}:\d{2}$/.test(values.endsAt) &&
    values.startsAt < values.endsAt;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${initial?.name || "period"}` : "New period"}
      description="One slot in the school day. The grid a timetable is laid out on is made of these."
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
            {isSubmitting ? "Saving…" : editing ? "Save the period" : "Create period"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="period-code">Code</Label>
          <Input
            id="period-code"
            value={values.code}
            placeholder="P1"
            maxLength={40}
            onChange={(event) =>
              setValues((current) => ({ ...current, code: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="period-name">Name</Label>
          <Input
            id="period-name"
            value={values.name}
            placeholder="Period 1"
            maxLength={120}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="period-start">Starts</Label>
          <Input
            id="period-start"
            type="time"
            value={values.startsAt}
            onChange={(event) =>
              setValues((current) => ({ ...current, startsAt: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="period-end">Ends</Label>
          <Input
            id="period-end"
            type="time"
            value={values.endsAt}
            onChange={(event) =>
              setValues((current) => ({ ...current, endsAt: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="period-sequence">Position in the day</Label>
          <Input
            id="period-sequence"
            type="number"
            min={0}
            max={100}
            value={values.sequence}
            onChange={(event) =>
              setValues((current) => ({ ...current, sequence: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="period-term">Term</Label>
          <Select
            value={values.termId || "__every__"}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                termId: value === "__every__" ? "" : value,
              }))
            }
          >
            <SelectTrigger id="period-term">
              <SelectValue placeholder="Every term" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__every__">Every term</SelectItem>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name} · {term.academicYear.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Most schools run one day shape all year. Name a term only when it
            genuinely differs.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Label className="flex items-start gap-2">
            <Checkbox
              checked={values.isTeaching}
              onCheckedChange={(checked) =>
                setValues((current) => ({ ...current, isTeaching: checked === true }))
              }
            />
            <span>
              Lessons are taught in it
              <span className="block text-muted-foreground">
                Leave this off for assembly, break and lunch. They still need to be
                here — the timetable lays the day out from them — but nothing may be
                scheduled inside one.
              </span>
            </span>
          </Label>
        </div>
      </div>
    </RecordDialog>
  );
}
