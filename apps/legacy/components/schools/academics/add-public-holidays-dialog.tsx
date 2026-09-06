"use client";

import { useState } from "react";

import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { Button } from "@corelithzw/ui/components/button";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { zimbabwePublicHolidays } from "@/components/schools/academics/zimbabwe-public-holidays";

/**
 * The statutory public holidays, entered in one press.
 *
 * The calendar's empty state has always told a school to "add the public
 * holidays first — they are the ones that make registers look missing", and
 * then asked it to type thirteen dialogs. The list is fixed in law, so it is
 * shown here before it is written: a registrar sees exactly which days are
 * about to appear, which is what makes this a confirm rather than a surprise.
 */
export function AddPublicHolidaysDialog({
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
  onSubmit: (year: number) => void;
}) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setYear(String(thisYear));
  }

  const chosen = Number(year) || thisYear;
  const holidays = zimbabwePublicHolidays(chosen);

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add the public holidays"
      description="Zimbabwe's statutory days for the year, all at once. Days already on the calendar are left alone."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!isSubmitting) onSubmit(chosen);
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding…" : `Add ${holidays.length} days`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="holidays-year">Year</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger id="holidays-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[thisYear - 1, thisYear, thisYear + 1].map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Shown before it is written. Easter moves, and a registrar who can
            see the dates is one who can catch a year entered wrong. */}
        <ul className="divide-y divide-[color:var(--border-subtle)] rounded-[var(--radius-md)] border border-[color:var(--border-subtle)]">
          {holidays.map((holiday) => (
            <li
              key={`${holiday.title}-${holiday.date}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm">{holiday.title}</span>
              <span className="font-[family-name:var(--font-mono)] text-sm text-[color:var(--text-muted)]">
                {holiday.date}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-sm text-muted-foreground">
          Every one of these closes the school. Half terms, exam weeks and speech
          day are the school&rsquo;s own — add those with &ldquo;Add a day&rdquo;.
        </p>
      </div>
    </RecordDialog>
  );
}
