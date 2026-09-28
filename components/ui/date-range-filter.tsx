"use client";

import { useState } from "react";

import { useDateRange } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "@/lib/icons";

/**
 * A range of calendar days, as `YYYY-MM-DD` either end. Null is open-ended.
 *
 * Days rather than instants on purpose. "From the 1st" means the 1st wherever
 * the person is, and a filter that turned it into midnight UTC would drop the
 * first two hours of the day in Harare. Callers that filter on instants — a
 * record's `createdAt` — convert at the edge with `dayStartIso`/`dayEndIso`.
 */
export type DayRange = { from: string | null; to: string | null };

/** The local calendar day a Date falls on. */
export function toDay(date: Date | null | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight at the start of a calendar day. */
function fromDay(day: string | null): Date | null {
  if (!day) return null;
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The first instant of a local day, for filtering on timestamps. */
export function dayStartIso(day: string | null): string | undefined {
  return fromDay(day)?.toISOString();
}

/** The last instant of a local day, for filtering on timestamps. */
export function dayEndIso(day: string | null): string | undefined {
  const start = fromDay(day);
  if (!start) return undefined;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
}

/** The local calendar day an ISO instant falls on — the inverse of the two above. */
export function isoToDay(iso: string | null | undefined): string | null {
  return iso ? toDay(new Date(iso)) : null;
}

type Preset = { label: string; range: () => { startDate: Date; endDate: Date } };

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** The four questions people actually ask of a date filter. */
const PRESETS: Preset[] = [
  { label: "Today", range: () => ({ startDate: startOfToday(), endDate: startOfToday() }) },
  {
    label: "Last 7 days",
    range: () => {
      const today = startOfToday();
      return { startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6), endDate: today };
    },
  },
  {
    label: "This month",
    range: () => {
      const today = startOfToday();
      return { startDate: new Date(today.getFullYear(), today.getMonth(), 1), endDate: today };
    },
  },
  {
    label: "Last month",
    range: () => {
      const today = startOfToday();
      return {
        startDate: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        endDate: new Date(today.getFullYear(), today.getMonth(), 0),
      };
    },
  },
];

function short(day: string): string {
  const date = fromDay(day)!;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** What the chip says the filter is set to. */
export function describeDayRange(value: DayRange, anyLabel = "Any time"): string {
  if (value.from && value.to) return value.from === value.to ? short(value.from) : `${short(value.from)} – ${short(value.to)}`;
  if (value.from) return `From ${short(value.from)}`;
  if (value.to) return `Until ${short(value.to)}`;
  return anyLabel;
}

/**
 * A date-range filter for a list's toolbar: a chip that says what it is set
 * to, opening onto the common ranges and two day fields.
 *
 * The range being edited is `useDateRange`'s, reset to whatever is applied
 * each time the chip opens, so an abandoned edit does not come back next
 * time. Every change applies at once — a filter chip fires immediately, like
 * every other chip on the row.
 */
export function DateRangeFilter({
  label,
  value,
  onChange,
  anyLabel = "Any time",
  max,
}: {
  /** What is being filtered — "Day", "Created". */
  label: string;
  value: DayRange;
  onChange: (next: DayRange) => void;
  /** What an empty range is called. */
  anyLabel?: string;
  /** The last day that can be picked, as `YYYY-MM-DD` — today, for money logged by the day. */
  max?: string;
}) {
  const [open, setOpen] = useState(false);
  const { startDate, endDate, setRange } = useDateRange({
    startDate: fromDay(value.from),
    endDate: fromDay(value.to),
  });

  const apply = (next: { startDate: Date | null; endDate: Date | null }) => {
    setRange(next);
    onChange({ from: toDay(next.startDate), to: toDay(next.endDate) });
  };

  // A backwards range is a slip, not a request for nothing: the other end
  // follows the one that was just moved.
  const moveStart = (day: string) => {
    const start = fromDay(day || null);
    const end = endDate ?? null;
    apply({ startDate: start, endDate: start && end && start > end ? start : end });
  };
  const moveEnd = (day: string) => {
    const end = fromDay(day || null);
    const start = startDate ?? null;
    apply({ startDate: start && end && start > end ? end : start, endDate: end });
  };

  const active = Boolean(value.from || value.to);
  const described = describeDayRange(value, anyLabel);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setRange({ startDate: fromDay(value.from), endDate: fromDay(value.to) });
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 whitespace-nowrap"
          aria-label={`${label}: ${described}`}
        >
          <span className="text-[var(--text-muted)]">{label}</span>
          <span className="font-semibold text-[var(--text-strong)]">{described}</span>
          <ChevronDown className="size-3 flex-none text-[var(--text-subtle)]" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                apply(preset.range());
                setOpen(false);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${label}-from`} className="text-sm">
              From
            </Label>
            <Input
              id={`${label}-from`}
              type="date"
              className="font-mono"
              max={max}
              value={toDay(startDate) ?? ""}
              onChange={(event) => moveStart(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${label}-to`} className="text-sm">
              To
            </Label>
            <Input
              id={`${label}-to`}
              type="date"
              className="font-mono"
              max={max}
              value={toDay(endDate) ?? ""}
              onChange={(event) => moveEnd(event.target.value)}
            />
          </div>
        </div>
        {active ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => {
              apply({ startDate: null, endDate: null });
              setOpen(false);
            }}
          >
            Clear
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
