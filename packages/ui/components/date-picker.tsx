"use client";

import * as React from "react";
import { format, setHours, setMinutes } from "date-fns";

import { Calendar } from "@corelithzw/react";
import { CalendarIcon, ChevronDown, Clock3 } from "../lib/icons";
import { Button } from "./button";
import { Label } from "./label";
import { ResponsivePopover } from "./responsive-popover";
import { Separator } from "./separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { cn } from "../lib/utils";

/**
 * DatePicker — Radix Popover around the design system's `Calendar`.
 *
 * This used to be react-day-picker dressed in DS tokens — a whole calendar
 * implementation carried for one component. The DS ships its own now, so the
 * dependency is gone and the grid is the same one the rest of the system
 * draws.
 *
 * The old `mode: "range"` is gone with it: the DS calendar is single-date,
 * and an audit found range mode had no callers — dead weight that was the
 * only reason react-day-picker was still installed. If a range picker is
 * needed later it is two of these, labelled From and To, not a dependency.
 *
 * `onChange(undefined)` is a real signal here — it is what the Clear button
 * emits.
 */
export type DatePickerMode = "single" | "date-time";

type CommonProps = {
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  align?: React.ComponentProps<typeof ResponsivePopover>["align"];
  sideOffset?: number;
  label?: string;
};

type SingleDatePickerProps = CommonProps & {
  mode?: "single";
  value?: Date;
  onChange: (value?: Date) => void;
};

type DateTimePickerProps = CommonProps & {
  mode: "date-time";
  value?: Date;
  onChange: (value?: Date) => void;
};

export type DatePickerProps = SingleDatePickerProps | DateTimePickerProps;

function formatTimeValue(value?: Date) {
  if (!value) return "09:00";
  return format(value, "HH:mm");
}

function combineDateAndTime(date: Date, timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map((part) => Number(part));
  const withHours = setHours(date, Number.isFinite(hours) ? hours : 9);
  return setMinutes(withHours, Number.isFinite(minutes) ? minutes : 0);
}

function buildTimeOptions(limit: number) {
  return Array.from({ length: limit }, (_, index) => String(index).padStart(2, "0"));
}

function formatSingleDate(value?: Date) {
  return value ? format(value, "MMM d, yyyy") : "Select date";
}

function formatDateTime(value?: Date) {
  return value ? format(value, "MMM d, yyyy h:mm a") : "Select date and time";
}

function DatePickerTrigger({
  className,
  value,
  placeholder,
  ...props
}: React.ComponentProps<typeof Button> & {
  value: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-9 w-full min-w-[220px] justify-between rounded-[var(--button-radius)] bg-[var(--surface)] px-3 text-left text-[var(--text-strong)] shadow-none [font:var(--type-label-sm)]",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <CalendarIcon className="h-4 w-4 text-[var(--text-muted)]" />
        <span className="truncate">{value ?? placeholder ?? "Select date"}</span>
      </span>
      <ChevronDown className="size-3 shrink-0 text-[var(--text-muted)]" />
    </Button>
  );
}

export function DatePicker(props: DatePickerProps) {
  const {
    className,
    triggerClassName,
    contentClassName,
    placeholder,
    disabled,
    align = "start",
    sideOffset = 8,
    label,
  } = props;

  const isDateTime = props.mode === "date-time";
  const hourOptions = React.useMemo(() => buildTimeOptions(24), []);
  const minuteOptions = React.useMemo(() => buildTimeOptions(60), []);
  const [open, setOpen] = React.useState(false);
  const [pendingDate, setPendingDate] = React.useState<Date | undefined>(props.value);
  const [timeValue, setTimeValue] = React.useState(() => formatTimeValue(props.value));

  React.useEffect(() => {
    setPendingDate(props.value);
    if (isDateTime) setTimeValue(formatTimeValue(props.value));
  }, [isDateTime, props.value]);

  const timeParts = React.useMemo(() => {
    const [hours = "09", minutes = "00"] = timeValue.split(":");
    return { hours, minutes };
  }, [timeValue]);

  const triggerValue = isDateTime
    ? formatDateTime(props.value)
    : formatSingleDate(props.value);

  const handleClear = () => {
    props.onChange(undefined);
    setPendingDate(undefined);
    setTimeValue("09:00");
  };

  const handleApplyDateTime = () => {
    if (!isDateTime || !pendingDate) return;
    props.onChange(combineDateAndTime(pendingDate, timeValue));
    setOpen(false);
  };

  const updateTimePart = (part: "hours" | "minutes", value: string) => {
    setTimeValue(
      part === "hours"
        ? `${value}:${timeParts.minutes}`
        : `${timeParts.hours}:${value}`,
    );
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label ? <Label>{label}</Label> : null}
      {/* A calendar is 280px wide and its trigger is usually near the bottom
          of a form, so on a phone the popover had to open *over* the fields
          above it. Below `sm` it comes up from the bottom edge instead. */}
      <ResponsivePopover
        open={open}
        onOpenChange={setOpen}
        title={isDateTime ? "Select date and time" : "Select date"}
        align={align}
        sideOffset={sideOffset}
        className={cn("w-auto p-0", contentClassName)}
        trigger={
          <DatePickerTrigger
            className={triggerClassName}
            value={triggerValue}
            placeholder={placeholder}
            disabled={disabled}
          />
        }
      >
          {/* `.popover` scopes `.pop-h` / `.ti` / `.pop-actions`; its own
              surface is cleared because PopoverContent already draws one. */}
          <div className="popover max-w-none overflow-hidden rounded-[var(--card-radius)] border-0 p-0 shadow-none">
            <div className="pop-h mb-0 items-start gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="min-w-0">
                <p className="ti">{isDateTime ? "Select date and time" : "Select date"}</p>
                <p className="text-[var(--text-muted)] [font:var(--type-caption)]">
                  {isDateTime
                    ? "Pick a day, then set the time."
                    : "Choose a single calendar date."}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={handleClear}>
                Clear
              </Button>
            </div>

            <div className="px-2 pt-2">
              <Calendar
                value={pendingDate ?? null}
                onValueChange={(nextDate) => {
                  if (isDateTime) {
                    setPendingDate(nextDate);
                    if (timeValue === "09:00") setTimeValue(formatTimeValue(nextDate));
                    return;
                  }
                  props.onChange(nextDate);
                  setOpen(false);
                }}
              />
            </div>

            {isDateTime ? (
              <>
                <Separator />
                <div className="space-y-3 px-4 py-4">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <div className="grid gap-2 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 sm:grid-cols-2">
                      <p className="mb-1 flex items-center gap-2 tracking-[0.16em] text-[var(--text-muted)] uppercase [font:var(--type-eyebrow)] sm:col-span-2">
                        <Clock3 className="h-3.5 w-3.5" />
                        Time
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                        <Select
                          value={timeParts.hours}
                          onValueChange={(value) => updateTimePart("hours", value)}
                        >
                          <SelectTrigger className="w-full shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {hourOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={timeParts.minutes}
                          onValueChange={(value) => updateTimePart("minutes", value)}
                        >
                          <SelectTrigger className="w-full shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {minuteOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5">
                      <p className="tracking-[0.16em] text-[var(--text-muted)] uppercase [font:var(--type-eyebrow)]">
                        Preview
                      </p>
                      <p className="mt-2 text-[var(--text-strong)] [font:var(--type-mono)]">
                        {pendingDate
                          ? formatDateTime(combineDateAndTime(pendingDate, timeValue))
                          : "Pick a date"}
                      </p>
                    </div>
                  </div>
                  <div className="pop-actions items-center">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleApplyDateTime} disabled={!pendingDate}>
                      Apply
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
      </ResponsivePopover>
    </div>
  );
}

export function DateTimePicker(props: Omit<DateTimePickerProps, "mode">) {
  return <DatePicker mode="date-time" {...props} />;
}
