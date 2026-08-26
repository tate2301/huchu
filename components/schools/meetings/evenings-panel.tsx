"use client";

import { Card } from "@corelithzw/react";

import { cn } from "@/lib/utils";

/**
 * One evening, already reduced from the slots.
 *
 * The panel is handed totals rather than slots so it cannot disagree with the
 * list beside it: both are counted off the same filtered set in one place.
 */
export type Evening = {
  /** `YYYY-MM-DD`, local time — the key an evening is grouped on. */
  key: string;
  /** "Thu 12 Mar". */
  label: string;
  teachers: number;
  booked: number;
  slots: number;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The term's evenings, as a month and as a list.
 *
 * A parents' evening is a date before it is a schedule. The teacher list
 * answers "who is booked with Ms Banda"; it cannot answer "which nights are we
 * open" without scrolling every card and reading the day headings, which is
 * the question the office is asked on the telephone all week.
 *
 * The month is drawn from the evenings themselves — one dot per night with
 * slots on it, filled where every one of them is taken. A night with room left
 * is the answer to "can you fit us in", so the two states have to be
 * distinguishable at a glance rather than by counting.
 *
 * It shows the month the evenings are in, not today's: a term whose evenings
 * are all in March is a March grid even when it is read in February.
 */
export function EveningsPanel({
  evenings,
  selectedKey,
  onSelect,
}: {
  evenings: Evening[];
  /** The evening the filter is narrowed to, or "" for the whole term. */
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  if (evenings.length === 0) {
    return (
      <Card title="The evenings" className="h-fit">
        <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          Nothing is open in this window yet. Open slots against a teacher and
          the nights appear here.
        </p>
      </Card>
    );
  }

  const byKey = new Map(evenings.map((evening) => [evening.key, evening]));

  // The month the first evening falls in. A term rarely spans two months of
  // evenings, and when it does the list below carries the rest — a two-month
  // grid in a 20rem column is unreadable.
  const [year, month] = evenings[0]!.key.split("-").map(Number);
  const monthIndex = (month ?? 1) - 1;
  const first = new Date(year ?? 1970, monthIndex, 1);
  const daysInMonth = new Date(year ?? 1970, monthIndex + 1, 0).getDate();
  // Monday-first, the way a school week is written.
  const leading = (first.getDay() + 6) % 7;

  const openNights = evenings.length;

  return (
    <div className="space-y-4">
      <Card
        title={`${MONTHS[monthIndex]} ${year}`}
        subtitle={`${openNights} evening${openNights === 1 ? "" : "s"} open`}
        className="h-fit"
      >
        <div className="grid grid-cols-7 gap-1 text-center">
          {["M", "T", "W", "T", "F", "S", "S"].map((initial, index) => (
            <span
              key={`${initial}-${index}`}
              className="text-[length:var(--type-caption)] font-semibold text-[color:var(--text-muted)]"
            >
              {initial}
            </span>
          ))}

          {Array.from({ length: leading }, (_, index) => (
            <span key={`lead-${index}`} aria-hidden="true" />
          ))}

          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1;
            const key = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
            const evening = byKey.get(key);
            const full = evening ? evening.booked >= evening.slots : false;
            const selected = selectedKey === key;

            if (!evening) {
              return (
                <span
                  key={key}
                  className="py-1 text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]"
                >
                  {day}
                </span>
              );
            }

            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                title={`${evening.label} · ${evening.booked} of ${evening.slots} booked`}
                onClick={() => onSelect(selected ? "" : key)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-[var(--radius-sm)] py-1 text-[length:var(--type-caption)] tabular-nums",
                  selected
                    ? "bg-[color:var(--brand-soft)] font-bold text-[color:var(--brand-strong)]"
                    : "font-semibold text-[color:var(--text-strong)] hover:bg-[color:var(--surface-muted)]",
                )}
              >
                {day}
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
                    full
                      ? "bg-[color:var(--tone-danger)]"
                      : "bg-[color:var(--tone-success)]",
                  )}
                />
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          <Legend dotClass="bg-[color:var(--tone-danger)]" label="Fully booked" />
          <Legend dotClass="bg-[color:var(--tone-success)]" label="Slots free" />
        </div>
      </Card>

      <Card title="The evenings" flush className="h-fit">
        <ul className="divide-y divide-[color:var(--border-subtle)]">
          {evenings.map((evening) => {
            const selected = selectedKey === evening.key;
            return (
              <li key={evening.key}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(selected ? "" : evening.key)}
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-2 text-left",
                    selected
                      ? "bg-[color:var(--brand-soft)]"
                      : "hover:bg-[color:var(--surface-muted)]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                      {evening.label}
                    </span>
                    <span className="block text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                      {evening.teachers} staff
                    </span>
                  </span>
                  <span className="shrink-0 font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] tabular-nums text-[color:var(--text-body)]">
                    {evening.booked} of {evening.slots}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function Legend({ dotClass, label }: { dotClass: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", dotClass)} />
      {label}
    </span>
  );
}

const pad = (value: number) => String(value).padStart(2, "0");
