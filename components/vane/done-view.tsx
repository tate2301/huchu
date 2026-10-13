"use client";

import * as React from "react";
import Link from "next/link";

import { Empty, Finding, TableShell } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import type { VaneDoneView } from "@/lib/vane/lists";

export const DONE_PERIODS = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
] as const;

const PERIOD_WORDS: Record<number, string> = { 1: "today", 7: "in the last 7 days", 30: "in the last 30 days" };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

/** "Today", "Yesterday", "Mon 6 Oct". */
function dayLabel(day: string, today: Date): string {
  const key = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  if (day === key(today)) return "Today";
  if (day === key(new Date(today.getTime() - 24 * 60 * 60 * 1000))) return "Yesterday";
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Done (`/vane/done`, the PageVaneDone board): what Vane did, a day at a
 * time, and what a person did next. A card's row opens it on For you, with
 * what it read.
 *
 * Pure: the page feeds it.
 */
export function DoneView({
  data,
  days,
  template,
  onQuery,
}: {
  data: VaneDoneView;
  days: number;
  template: string | null;
  onQuery: (next: { days?: number; template?: string | null }) => void;
}) {
  const things = `${data.total.toLocaleString("en-GB")} ${data.total === 1 ? "thing" : "things"}`;
  const today = new Date();
  return (
    <>
      <Finding
        fact={`Vane did ${things} ${PERIOD_WORDS[days]}; people took ${data.taken.toLocaleString("en-GB")} of them further.`}
        rest="Every row says what Vane did on its own and who pressed the button after."
      />
      <div className="ws-tools" style={{ flexWrap: "wrap" }}>
        <MenuButton
          variant="quiet"
          icon="calendar"
          label="When"
          data-filter=""
          items={DONE_PERIODS.map((period) => ({
            key: String(period.days),
            label: period.label,
            checked: days === period.days,
            onSelect: () => onQuery({ days: period.days }),
          }))}
        >
          {DONE_PERIODS.find((period) => period.days === days)?.label ?? "Last 7 days"}
        </MenuButton>
        <MenuButton
          variant="quiet"
          icon="plus"
          label="Template"
          data-filter=""
          items={[
            { key: "every", label: "Every template", checked: !template, onSelect: () => onQuery({ template: null }) },
            ...(data.templates.length > 0 ? [{ separator: true as const }] : []),
            ...data.templates.map((kind) => ({
              key: kind,
              label: kind,
              checked: template === kind,
              onSelect: () => onQuery({ template: kind }),
            })),
          ]}
        >
          {template ?? "Every template"}
        </MenuButton>
        <div className="end">
          {data.jobs.period.toLocaleString("en-GB")} jobs · {data.jobs.month.toLocaleString("en-GB")} this month
        </div>
      </div>
      {data.days.length === 0 ? (
        <Empty icon="done" title={`Nothing ${PERIOD_WORDS[days]}`}>
          Each card Vane raises and each job it finishes shows here, with what a person did next.
        </Empty>
      ) : (
        <div className="wt" style={{ flex: "none" }}>
          <TableShell label="What Vane did">
            <table className="table" style={{ minWidth: 760 }}>
              <colgroup>
                <col />
                <col style={{ width: "50%" }} />
                <col />
                <col style={{ width: "50%" }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>When</th>
                  <th>What Vane did</th>
                  <th>Template</th>
                  <th>What happened next</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => (
                  <React.Fragment key={day.day}>
                    <tr className="grp">
                      <td colSpan={5}>
                        {dayLabel(day.day, today)}
                        <span className="n">{day.rows.length}</span>
                      </td>
                    </tr>
                    {day.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="muted">{time(row.at)}</td>
                        <td className="fill">
                          {row.cardId ? (
                            <Link className="cell-lead" href={`/vane?card=${row.cardId}`}>
                              {row.what}
                            </Link>
                          ) : (
                            <span className="cell-lead">{row.what}</span>
                          )}
                        </td>
                        <td>
                          <span className="ref">{row.template}</span>
                        </td>
                        <td className={row.next === "Open" ? "fill muted" : "fill"}>{row.next}</td>
                        <td className="num" style={{ color: "var(--color-faint)" }}>
                          —
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      )}
    </>
  );
}
