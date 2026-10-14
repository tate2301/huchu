"use client";

import * as React from "react";

import { Empty, Finding } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import type { DoneQuery, VaneDone } from "@/lib/vane/pages";

import { clock, dayLabel, plural } from "./format";

const PERIODS: Array<{ key: DoneQuery["period"]; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

/** A job's kind as the filter names it: "nightly" → "Nightly", "person" → "Jobs people gave". */
export function kindLabel(kind: string): string {
  if (kind === "person") return "Jobs people gave";
  if (kind === "nightly") return "The nightly look";
  if (kind === "plan-step") return "Steps of a plan";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/**
 * Done (PageVaneDone): what Vane finished, by day, newest first; each row
 * what it did, the template (the job's kind) and what a person did next.
 * Filtered by period, by who gave the job and by template.
 */
export function DoneView({ data, onQuery }: { data: VaneDone; onQuery: (next: Partial<DoneQuery>) => void }) {
  const period = PERIODS.find((entry) => entry.key === data.period) ?? PERIODS[1]!;
  return (
    <div className="kbody vn-body">
      <Finding
        fact={`Vane did ${plural(data.today.done, "thing")} today; people took ${data.today.takenFurther} of them further.`}
        rest="Every row says what Vane did on its own and what a person did after."
      />
      <div className="ws-tools">
        <MenuButton
          className={data.period === "7d" ? "chipsel" : "chipsel is-set"}
          icon="calendar"
          label="Period"
          items={PERIODS.map((entry) => ({
            key: entry.key,
            label: entry.label,
            checked: entry.key === data.period,
            onSelect: () => onQuery({ period: entry.key }),
          }))}
        >
          {period.label}
        </MenuButton>
        <MenuButton
          className={data.who === "everyone" ? "chipsel" : "chipsel is-set"}
          icon="users"
          label="Who gave the job"
          items={[
            { key: "everyone", label: "Everyone", checked: data.who === "everyone", onSelect: () => onQuery({ who: "everyone" }) },
            { key: "me", label: "Jobs you gave", checked: data.who === "me", onSelect: () => onQuery({ who: "me" }) },
          ]}
        >
          {data.who === "everyone" ? "Everyone" : "Jobs you gave"}
        </MenuButton>
        <MenuButton
          className={data.kind ? "chipsel is-set" : "chipsel"}
          icon="filter"
          label="Template"
          items={[
            { key: "all", label: "Every template", checked: !data.kind, onSelect: () => onQuery({ kind: null }) },
            { separator: true },
            ...data.kinds.map((kind) => ({ key: kind, label: kindLabel(kind), checked: data.kind === kind, onSelect: () => onQuery({ kind }) })),
          ]}
        >
          {data.kind ? kindLabel(data.kind) : "Every template"}
        </MenuButton>
        <div className="end">
          {plural(data.total, "job")} · {data.thisMonth.toLocaleString("en-GB")} this month
        </div>
      </div>
      {data.days.length === 0 ? (
        <Empty icon="done" title="Nothing done in these days">
          What Vane finishes shows here by day, with what a person did next. Try a longer period.
        </Empty>
      ) : (
        <div className="wt">
          <table className="table vn-done">
            <thead>
              <tr>
                <th className="vn-c-when">When</th>
                <th>What Vane did</th>
                <th className="vn-c-kind">Template</th>
                <th className="vn-c-next">What happened next</th>
                <th className="num vn-c-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((day) => (
                <React.Fragment key={day.day}>
                  <tr className="grp">
                    <td colSpan={5}>
                      {dayLabel(day.day)}
                      <span className="n">{day.rows.length}</span>
                    </td>
                  </tr>
                  {day.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="muted">{clock(row.at)}</td>
                      <td className="fill" title={`Called ${plural(row.cost.tools, "tool")}; ${row.cost.tokensIn.toLocaleString("en-GB")} tokens in, ${row.cost.tokensOut.toLocaleString("en-GB")} out`}>
                        <span className="truncate">{row.text}</span>
                      </td>
                      <td>
                        <span className="truncate">{row.kind}</span>
                      </td>
                      <td className={row.next.muted ? "fill muted" : "fill"}>
                        <span className="truncate">{row.next.label}</span>
                      </td>
                      <td className="num" />
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
