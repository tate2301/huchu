"use client";

import * as React from "react";

import { Calendar } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { ResponsivePopover } from "@/components/ui/responsive-popover";
import { useIsBelow } from "@/hooks/use-mobile";
import { CalendarIcon, Check, ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  BAD_DAY,
  BAD_TIME,
  DEFAULT_TIME_ZONE,
  addDays,
  dayBoundRefusal,
  dayRangeWords,
  daysBetween,
  formatMediumDay,
  formatPicked,
  parseDay,
  parseTime,
  todayIn,
} from "@/lib/workspace/format";

import "./date-picker.css";

/**
 * One date picker and one date-range picker (FND-DATES), around the design
 * system's `Calendar`.
 *
 * Values are days as strings, never `Date`: `"YYYY-MM-DD"`, or
 * `"YYYY-MM-DDTHH:mm"` for a shop wall-clock time. A day has no zone; "today"
 * and the range picker's default `latest` are read in `timeZone`, Harare
 * unless it says otherwise. A `Date` exists only to feed the DS grid, built as
 * a local midnight and read back with local getters, so no zone leaks in.
 *
 * The DS grid is single-select, Monday first, always 42 cells, and has no
 * arrow keys. Both pickers add those here on the cells it draws: a range's
 * other end and the days between are marked with `data-range`, and the arrow
 * keys move focus by the same index mapping (`gridIndex`), which a test pins
 * to the DS markup.
 */

export type DayRange = { from: string | null; to: string | null };
export type DayPreset = { key: string; label: string; range: (today: string) => { from: string; to: string } };

const pad = (n: number) => String(n).padStart(2, "0");

/** The first of the day's month. */
const monthOf = (day: string) => `${day.slice(0, 7)}-01`;

/** A local midnight for the DS grid. Never `new Date("YYYY-MM-DD")`, which is UTC midnight. */
function toLocal(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date!);
}

function fromLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The same day `n` months on, kept inside the shorter month (31 January → 28 February). */
function addMonths(day: string, n: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const first = new Date(Date.UTC(year!, month! - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(date!, last))}`;
}

/** The first day the DS grid draws for a month: the Monday on or before the 1st. */
export function gridStart(month: string): string {
  const first = monthOf(month);
  return addDays(first, -((toLocal(first).getDay() + 6) % 7));
}

/** Where a day sits among the DS grid's 42 cells for a month. */
export function gridIndex(month: string, day: string): number {
  return daysBetween(gridStart(month), day) - 1;
}

/** The six ranges people ask of a date filter. */
export const COMMON_PRESETS: ReadonlyArray<DayPreset> = [
  { key: "today", label: "Today", range: (today) => ({ from: today, to: today }) },
  { key: "yesterday", label: "Yesterday", range: (today) => ({ from: addDays(today, -1), to: addDays(today, -1) }) },
  { key: "7d", label: "Last 7 days", range: (today) => ({ from: addDays(today, -6), to: today }) },
  { key: "30d", label: "Last 30 days", range: (today) => ({ from: addDays(today, -29), to: today }) },
  { key: "month", label: "This month", range: (today) => ({ from: monthOf(today), to: today }) },
  {
    key: "last-month",
    label: "Last month",
    range: (today) => ({ from: addMonths(monthOf(today), -1), to: addDays(monthOf(today), -1) }),
  },
];

type Mark = "end" | "in";

/**
 * The DS grid with arrow keys, range marks and one tab stop. `focusDay` is the
 * cell Tab lands on; the marks are set on the DS cells after every render.
 */
function DayGrid({
  month,
  onMonth,
  selected,
  focusDay,
  earliest,
  latest,
  mark,
  onPick,
}: {
  month: string;
  onMonth: (month: string) => void;
  selected: string | null;
  focusDay: string;
  earliest?: string | null;
  latest?: string | null;
  mark?: (day: string) => Mark | null;
  onPick: (day: string) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const pendingFocus = React.useRef<string | null>(null);
  const outside = React.useCallback((day: string) => dayBoundRefusal(day, earliest, latest) !== null, [earliest, latest]);

  const cells = () => [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="gridcell"]') ?? [])];

  React.useLayoutEffect(() => {
    const list = cells();
    const start = gridStart(month);
    // One tab stop: the day in hand if it is on this page and can be picked, else the first that can.
    let stop = gridIndex(month, focusDay);
    if (stop < 0 || stop > 41 || outside(focusDay)) {
      stop = list.findIndex((cell, i) => addDays(start, i).slice(0, 7) === month.slice(0, 7) && !cell.disabled);
    }
    // PageUp and PageDown change month, so the month buttons stay out of the way of Tab.
    for (const button of ref.current?.querySelectorAll<HTMLButtonElement>('button[aria-label$=" month"]') ?? []) {
      button.tabIndex = -1;
    }
    list.forEach((cell, i) => {
      const day = addDays(start, i);
      const m = mark?.(day) ?? null;
      if (m) cell.dataset.range = m;
      else delete cell.dataset.range;
      cell.tabIndex = i === stop ? 0 : -1;
    });
    if (pendingFocus.current) {
      list[gridIndex(month, pendingFocus.current)]?.focus();
      pendingFocus.current = null;
    }
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    const list = cells();
    const index = list.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const day = addDays(gridStart(month), index);
    const weekday = index % 7;
    const target =
      event.key === "ArrowLeft"
        ? addDays(day, -1)
        : event.key === "ArrowRight"
          ? addDays(day, 1)
          : event.key === "ArrowUp"
            ? addDays(day, -7)
            : event.key === "ArrowDown"
              ? addDays(day, 7)
              : event.key === "PageUp"
                ? addMonths(day, -1)
                : event.key === "PageDown"
                  ? addMonths(day, 1)
                  : event.key === "Home"
                    ? addDays(day, -weekday)
                    : event.key === "End"
                      ? addDays(day, 6 - weekday)
                      : null;
    if (!target) return;
    event.preventDefault();
    if (outside(target)) return;
    if (monthOf(target) !== month) {
      pendingFocus.current = target;
      onMonth(monthOf(target));
      return;
    }
    const cell = list[gridIndex(month, target)];
    if (!cell) return;
    list[index]!.tabIndex = -1;
    cell.tabIndex = 0;
    cell.focus();
  };

  return (
    <div ref={ref} className="dp-grid" onKeyDown={onKeyDown}>
      <Calendar
        className="dp-calendar"
        style={{ border: 0, boxShadow: "none", padding: 0, background: "transparent", borderRadius: 0 }}
        value={selected ? toLocal(selected) : null}
        month={toLocal(month)}
        onMonthChange={(next) => onMonth(fromLocal(next))}
        onValueChange={(date) => onPick(fromLocal(date))}
        isDateDisabled={(date) => outside(fromLocal(date))}
      />
    </div>
  );
}

/** A field-style button showing the picked day, for callers that bring no trigger. */
const FieldTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { shown: string | null; placeholder: string; invalid?: boolean }
>(function FieldTrigger({ shown, placeholder, invalid, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn("dp-trigger", invalid && "is-invalid", className)}
      {...props}
    >
      <span className={shown ? "dp-trigger__value" : "dp-trigger__placeholder"}>{shown ?? placeholder}</span>
      <CalendarIcon className="dp-trigger__icon" aria-hidden="true" />
    </button>
  );
});

type Opening = { open?: boolean; onOpenChange?: (open: boolean) => void };

/** Open state, the caller's or its own, and whether it has just opened. */
function useOpen({ open: openProp, onOpenChange }: Opening, onOpened: () => void) {
  const [own, setOwn] = React.useState(false);
  const open = openProp ?? own;
  const [was, setWas] = React.useState(false);
  if (open !== was) {
    setWas(open);
    if (open) onOpened();
  }
  const setOpen = (next: boolean) => {
    setOwn(next);
    onOpenChange?.(next);
  };
  return [open, setOpen] as const;
}

export type DatePickerProps = Opening & {
  /** `"YYYY-MM-DD"`, or `"YYYY-MM-DDTHH:mm"` with `time`. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** A day and a time, 24-hour. */
  time?: boolean;
  /** Inclusive days: others are disabled in the grid and refused when typed. */
  earliest?: string;
  latest?: string;
  /** Draws "Clear", which sends null. */
  clearable?: boolean;
  /** The sheet's title on a phone, and the trigger's name. */
  label?: string;
  placeholder?: string;
  /** The caller's control; a field-style button showing the day when absent. */
  trigger?: React.ReactElement;
  /** Opens from another element. */
  anchor?: React.RefObject<HTMLElement | null>;
  timeZone?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  "aria-describedby"?: string;
};

export function DatePicker({
  value,
  onChange,
  time = false,
  earliest,
  latest,
  clearable = false,
  label,
  placeholder,
  trigger,
  open: openProp,
  onOpenChange,
  anchor,
  timeZone = DEFAULT_TIME_ZONE,
  disabled,
  id,
  invalid,
  "aria-describedby": describedBy,
}: DatePickerProps) {
  const today = todayIn(timeZone);
  const words = placeholder ?? (time ? "Choose a date and time" : "Choose a date");
  const [day, setDay] = React.useState("");
  const [clock, setClock] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [month, setMonth] = React.useState(monthOf(today));
  const fieldRef = React.useRef<HTMLInputElement>(null);
  const timeRef = React.useRef<HTMLInputElement>(null);
  const errorId = React.useId();

  const [open, setOpen] = useOpen({ open: openProp, onOpenChange }, () => {
    const [d, t] = value ? value.split("T") : [null, null];
    setDay(d ? formatMediumDay(d) : "");
    setClock(t ?? "");
    setError(null);
    setMonth(monthOf(d ?? (latest && today > latest ? latest : earliest && today < earliest ? earliest : today)));
  });

  const typed = parseDay(day);

  const finish = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  const apply = () => {
    if (!typed) return setError(BAD_DAY);
    const refusal = dayBoundRefusal(typed, earliest, latest);
    if (refusal) return setError(refusal);
    if (!time) return finish(typed);
    const hhmm = parseTime(clock);
    if (!hhmm) {
      setError(BAD_TIME);
      timeRef.current?.focus();
      return;
    }
    finish(`${typed}T${hhmm}`);
  };

  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    apply();
  };

  const pick = (picked: string) => {
    if (!time) return finish(picked);
    setDay(formatMediumDay(picked));
    setError(null);
    if (!parseTime(clock)) timeRef.current?.focus();
  };

  const shown = value ? formatPicked(value) : null;

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={label ?? words}
      align="start"
      sideOffset={6}
      className="dp-pop w-auto p-0"
      anchor={anchor}
      initialFocus={fieldRef}
      trigger={
        anchor
          ? undefined
          : (trigger ?? (
              <FieldTrigger
                id={id}
                shown={shown}
                placeholder={words}
                invalid={invalid}
                disabled={disabled}
                aria-label={label ? `${label}: ${shown ?? words}` : undefined}
                aria-describedby={describedBy}
              />
            ))
      }
    >
      {/* Keys stay here: a sheet or a rail row behind must not answer them. */}
      <div className="dp" onKeyDown={(event) => event.stopPropagation()}>
        <div className="dp-head">
          <input
            ref={fieldRef}
            className="dp-input"
            aria-label={label ? `${label}, as a date` : "Date"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            autoComplete="off"
            placeholder="7 Oct 2026"
            value={day}
            onChange={(event) => {
              setDay(event.target.value);
              setError(null);
              const next = parseDay(event.target.value);
              if (next) setMonth(monthOf(next));
            }}
            onKeyDown={onEnter}
          />
          {clearable && value ? (
            <button type="button" className="dp-quiet" onClick={() => finish(null)}>
              Clear
            </button>
          ) : null}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="dp-line dp-line--bad">
            {error}
          </p>
        ) : null}
        <DayGrid
          month={month}
          onMonth={setMonth}
          selected={typed}
          focusDay={typed ?? today}
          earliest={earliest}
          latest={latest}
          onPick={pick}
        />
        {time ? (
          <div className="dp-foot">
            <label className="dp-time">
              <span>Time</span>
              <input
                ref={timeRef}
                className="dp-input"
                inputMode="numeric"
                autoComplete="off"
                placeholder="09:00"
                value={clock}
                onChange={(event) => {
                  setClock(event.target.value);
                  setError(null);
                }}
                onKeyDown={onEnter}
              />
            </label>
            <span className="dp-foot__buttons">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={apply}>
                Apply
              </Button>
            </span>
          </div>
        ) : null}
      </div>
    </ResponsivePopover>
  );
}

export type DateRangePickerProps = Opening & {
  value: DayRange;
  /** Fires on Apply or on a preset, never per click. */
  onChange: (range: DayRange) => void;
  /** None: no preset column. */
  presets?: ReadonlyArray<DayPreset>;
  /** Either end may be left open (and both, which is "any time"). */
  openEnded?: boolean;
  /** Longer ranges are refused. */
  maxDays?: number;
  earliest?: string;
  /** Today in `timeZone` when absent; null for no bound (a list of expected dates). */
  latest?: string | null;
  title?: string;
  trigger?: React.ReactElement;
  anchor?: React.RefObject<HTMLElement | null>;
  timeZone?: string;
};

type End = "from" | "to";

/** A typed end: its day, or that it could not be read. */
function readEnd(text: string): { day: string | null; bad: boolean } {
  if (!text.trim()) return { day: null, bad: false };
  const day = parseDay(text);
  return { day, bad: day === null };
}

export function DateRangePicker({
  value,
  onChange,
  presets,
  openEnded = false,
  maxDays,
  earliest,
  latest: latestProp,
  title = "Choose dates",
  trigger,
  open: openProp,
  onOpenChange,
  anchor,
  timeZone = DEFAULT_TIME_ZONE,
}: DateRangePickerProps) {
  const today = todayIn(timeZone);
  const latest = latestProp === undefined ? today : latestProp;
  const phone = Boolean(useIsBelow(640));
  const [fromText, setFromText] = React.useState("");
  const [toText, setToText] = React.useState("");
  const [editing, setEditing] = React.useState<End>("from");
  // After a click has set the second end, the next click starts over at From.
  const [restart, setRestart] = React.useState(false);
  const [month, setMonth] = React.useState(monthOf(today));
  const fromRef = React.useRef<HTMLInputElement>(null);
  const toRef = React.useRef<HTMLInputElement>(null);
  const lineId = React.useId();

  const [open, setOpen] = useOpen({ open: openProp, onOpenChange }, () => {
    setFromText(value.from ? formatMediumDay(value.from) : "");
    setToText(value.to ? formatMediumDay(value.to) : "");
    setEditing("from");
    setRestart(false);
    setMonth(monthOf(value.to ?? value.from ?? (latest && today > latest ? latest : today)));
  });

  const from = readEnd(fromText);
  const to = readEnd(toText);

  const refusal = (() => {
    if (from.bad || to.bad) return BAD_DAY;
    for (const day of [from.day, to.day]) {
      const out = day ? dayBoundRefusal(day, earliest, latest) : null;
      if (out) return out;
    }
    if (from.day && to.day && from.day > to.day) return "The first day is after the last.";
    if (maxDays && from.day && to.day && daysBetween(from.day, to.day) > maxDays) {
      return `Choose dates no more than ${maxDays === 366 ? "a year" : `${maxDays} days`} apart.`;
    }
    return null;
  })();
  const complete = openEnded || Boolean(from.day && to.day);
  const canApply = !refusal && complete;

  const range = { from: from.day, to: to.day };
  const line = refusal
    ? refusal
    : from.day && to.day
      ? `${dayRangeWords(range, today)} · ${daysBetween(from.day, to.day)} ${from.day === to.day ? "day" : "days"}`
      : from.day || to.day
        ? dayRangeWords(range, today)
        : openEnded
          ? "Any time"
          : "Choose the first and last day.";

  const finish = (next: DayRange) => {
    onChange(next);
    setOpen(false);
  };

  const apply = () => {
    if (canApply) finish(range);
  };

  const setEnd = (end: End, day: string) => (end === "from" ? setFromText : setToText)(formatMediumDay(day));

  const pick = (day: string) => {
    if (editing === "from" || restart) {
      setEnd("from", day);
      if (restart || (to.day && day > to.day)) setToText("");
      setEditing("to");
      setRestart(false);
      return;
    }
    if (from.day && day < from.day) {
      setEnd("to", from.day);
      setEnd("from", day);
    } else {
      setEnd("to", day);
    }
    setEditing("from");
    setRestart(true);
  };

  const typed = (end: End, text: string) => {
    (end === "from" ? setFromText : setToText)(text);
    const day = parseDay(text);
    if (!day) return;
    setMonth(monthOf(day));
    // A From typed in full hands the next click to To.
    if (end === "from") setEditing("to");
    setRestart(false);
  };

  const onEnter = (end: End) => (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canApply) return apply();
    if (end === "from" && from.day && !to.day) toRef.current?.focus();
  };

  const edited = editing === "from" ? from.day : to.day;
  const current = presets?.find((preset) => {
    const r = preset.range(today);
    return r.from === value.from && r.to === value.to;
  });

  const mark = (day: string): Mark | null => {
    const a = from.day;
    const b = to.day;
    if (a && b) {
      if (day === a || day === b) return "end";
      return day > a && day < b ? "in" : null;
    }
    return day === (a ?? b) ? "end" : null;
  };

  const field = (end: End) => (
    <label className={cn("dp-end", editing === end && "is-editing")}>
      <span className="dp-end__label">{end === "from" ? "From" : "To"}</span>
      <input
        ref={end === "from" ? fromRef : toRef}
        className="dp-input"
        autoComplete="off"
        placeholder="Day"
        aria-describedby={lineId}
        aria-invalid={(end === "from" ? from.bad : to.bad) || undefined}
        value={end === "from" ? fromText : toText}
        onFocus={() => {
          setEditing(end);
          setRestart(false);
        }}
        onChange={(event) => typed(end, event.target.value)}
        onKeyDown={onEnter(end)}
      />
    </label>
  );

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={title}
      align="start"
      sideOffset={6}
      className="dp-pop w-auto p-0"
      anchor={anchor}
      initialFocus={fromRef}
      trigger={anchor ? undefined : trigger}
    >
      <div className={cn("dpr", presets?.length && "dpr--presets")} onKeyDown={(event) => event.stopPropagation()}>
        {presets?.length ? (
          <div className={phone ? "dpr-chips" : "dpr-presets"} role="group" aria-label="Common ranges">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className={cn(phone ? "dpr-chip" : "dpr-preset", current?.key === preset.key && "is-on")}
                aria-pressed={current?.key === preset.key}
                onClick={() => finish(preset.range(today))}
              >
                {phone ? null : (
                  <span className="dpr-preset__mark">{current?.key === preset.key ? <Check aria-hidden /> : null}</span>
                )}
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="dpr-main">
          <div className="dpr-ends">
            {field("from")}
            {field("to")}
          </div>
          <DayGrid
            month={month}
            onMonth={setMonth}
            selected={edited}
            focusDay={edited ?? from.day ?? today}
            earliest={earliest}
            latest={latest}
            mark={mark}
            onPick={pick}
          />
          <p id={lineId} className={cn("dp-line", refusal && "dp-line--bad")} role={refusal ? "alert" : undefined}>
            {line}
          </p>
          <div className="dpr-foot">
            {openEnded && (value.from || value.to) ? (
              <button type="button" className="dp-quiet" onClick={() => finish({ from: null, to: null })}>
                Clear
              </button>
            ) : null}
            <span className="dp-foot__buttons">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={!canApply} onClick={apply}>
                Apply
              </Button>
            </span>
          </div>
        </div>
      </div>
    </ResponsivePopover>
  );
}

/**
 * A toolbar chip for a range filter: "Period 1 to 3 October ⌄", the outline
 * chip the CRM toolbars draw. The words are `dayRangeWords`, or what an empty
 * range is called.
 */
export const DayRangeChip = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button> & { label: string; range: DayRange; anyLabel?: string; timeZone?: string }
>(function DayRangeChip({ label, range, anyLabel = "Any time", timeZone = DEFAULT_TIME_ZONE, className, ...props }, ref) {
  const words = dayRangeWords(range, todayIn(timeZone)) || anyLabel;
  return (
    <Button
      ref={ref}
      variant="outline"
      size="sm"
      className={cn("shrink-0 gap-1.5 whitespace-nowrap", className)}
      aria-label={`${label}: ${words}`}
      {...props}
    >
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--text-strong)]">{words}</span>
      <ChevronDown className="size-3 flex-none text-[var(--text-subtle)]" aria-hidden="true" />
    </Button>
  );
});
