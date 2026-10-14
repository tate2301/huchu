"use client";

import * as React from "react";

import { SelectCell, TextArea, VaneMark } from "@/components/core";
import type { RemindersPage } from "@/lib/schools/fee-reminders";

type Draft = NonNullable<RemindersPage["draft"]>;

const money = (amount: number) => `$${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sentence = (text: string) => (text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text);

/**
 * Remind families (the PageVaneSchool board): the finding, the reminder Vane
 * drafted in the school's words (changed here, for every family), and the
 * families it goes to, each ticked or not, with what they owe. Pure: the page
 * holds the words and the ticks, and sends.
 */
export function RemindPageView({
  draft,
  message,
  leaveOut,
  disabled = false,
  onMessage,
  onTick,
}: {
  draft: Draft;
  message: string;
  leaveOut: string[];
  disabled?: boolean;
  onMessage: (message: string) => void;
  onTick: (studentId: string, ticked: boolean) => void;
}) {
  const families = React.useMemo(() => [...draft.families].sort((a, b) => b.owed - a.owed || a.family.localeCompare(b.family)), [draft.families]);
  const ticked = families.filter((family) => !leaveOut.includes(family.studentId));
  const owed = ticked.reduce((sum, family) => sum + family.owed, 0);
  const all = ticked.length === families.length;

  return (
    <div className="kbody">
      <div className="finding">
        <p className="lede-figure">
          {draft.finding.fact} <span className="q">{draft.finding.rest}</span>
        </p>
      </div>
      {draft.failed ? (
        <p role="alert" style={{ margin: "0 28px 12px", color: "var(--color-danger)" }}>
          {draft.failed}
        </p>
      ) : null}
      <div
        style={{
          margin: "0 28px 18px",
          padding: "14px 16px",
          border: "1px solid var(--color-line)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <label htmlFor="vane-reminder" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <VaneMark size={16} />
          The reminder Vane drafted
        </label>
        <TextArea id="vane-reminder" rows={3} value={message} disabled={disabled} onChange={(event) => onMessage(event.target.value)} />
        <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
          Each family sees its own name and amount. Change the words here; it changes all {families.length}.
        </span>
      </div>
      <div className="wt" style={{ flex: "none" }}>
        <table className="table">
          <colgroup>
            <col />
            <col style={{ width: "50%" }} />
            <col style={{ width: "50%" }} />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <SelectCell
                head
                checked={all}
                indeterminate={!all && ticked.length > 0}
                label="Tick every family"
                onChange={() => families.forEach((family) => onTick(family.studentId, !all))}
              />
              <th>Family</th>
              <th>Pupil</th>
              <th className="num">Owed</th>
              <th>Goes by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {families.map((family) => {
              const on = !leaveOut.includes(family.studentId);
              const vaneLeft = draft.leaveOut.includes(family.studentId);
              return (
                <tr key={family.studentId} aria-selected={on || undefined}>
                  <SelectCell checked={on} label={`Remind ${family.family}`} onChange={() => onTick(family.studentId, !on)} />
                  <td className="fill">
                    <span className="cell-lead truncate" title={family.family}>
                      {family.family}
                    </span>
                  </td>
                  <td className="fill muted">
                    <span className="truncate" title={family.pupil}>
                      {family.pupil}
                    </span>
                  </td>
                  <td className="num">{money(family.owed)}</td>
                  <td className="muted">{family.goesBy}</td>
                  <td className="muted">{!on && vaneLeft && draft.leaveOutWhy ? sentence(draft.leaveOutWhy) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-foot" style={{ marginTop: "auto" }}>
        <div className="foot-row">
          <span className="num">
            {ticked.length} of {families.length} ticked
          </span>
          <span className="foot-sum">
            Owed <b>{money(owed)}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
