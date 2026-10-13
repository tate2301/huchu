"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Field, Icon, Input, Select } from "@/components/core";
import { POLICY_LABEL, type CloseView } from "@/lib/books/close";

const STATE_COLOUR = { done: "var(--color-success)", open: "var(--color-warning)", failed: "var(--color-danger)" } as const;
const STATE_ICON = { done: "check", open: "warn", failed: "warn" } as const;
const PERIOD_STATUS = {
  open: { cls: "status status-success", label: "Open" },
  closed: { cls: "status", label: "Closed" },
  reopened: { cls: "status status-warning", label: "Reopened" },
} as const;

export type ClosingControls = { retainedEarningsAccountId: string; freezeBeforeDate: string; policy: CloseView["controls"]["policy"] };

/**
 * Books → Periods and the close (PageBooksClose): the finding, the month's
 * five checks with what clears each, Close, every period, and the closing
 * controls beside them.
 */
export function ClosePageView({
  data,
  onClose,
  onReplay,
  onReopen,
  onSaveControls,
  closing = false,
  saving = false,
}: {
  data: CloseView;
  onClose: () => void;
  onReplay: () => void;
  onReopen: (periodId: string) => void;
  onSaveControls: (controls: ClosingControls) => void;
  closing?: boolean;
  saving?: boolean;
}) {
  const [controls, setControls] = React.useState<ClosingControls>({
    retainedEarningsAccountId: data.controls.retainedEarningsAccountId ?? "",
    freezeBeforeDate: data.controls.freezeBeforeDate ?? "",
    policy: data.controls.policy,
  });
  const month = data.closing?.month;
  return (
    <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
      <div className="kbody">
        <div className="finding">
          <p className="lede-figure">
            {data.finding.fact}
            {data.finding.rest ? <span className="q"> {data.finding.rest}</span> : null}
          </p>
        </div>
        {data.closing ? (
          <>
            <div className="group-head" style={{ paddingTop: 24 }}>
              <h2>Before {month} can close</h2>
            </div>
            <div className="list">
              {data.closing.checks.map((check) => (
                <div
                  className="row"
                  key={check.key}
                  style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr) minmax(0,1fr) 110px", gap: 12, alignItems: "center", minHeight: 48 }}
                >
                  <span style={{ color: STATE_COLOUR[check.state] }}>
                    <Icon name={STATE_ICON[check.state]} />
                  </span>
                  <span className="lead">{check.label}</span>
                  <span style={{ color: check.state === "done" ? "var(--color-muted)" : STATE_COLOUR[check.state] }}>{check.note}</span>
                  <span style={{ textAlign: "right" }}>
                    {check.action ? (
                      check.action.href === "replay" ? (
                        <Button onClick={onReplay}>{check.action.label}</Button>
                      ) : (
                        <Link className="btn" href={check.action.href}>
                          {check.action.label}
                        </Link>
                      )
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 24px" }}>
              <span className="muted" style={{ flex: 1 }}>
                Closing sweeps income and expenses into retained earnings. Reopening needs a reason.
              </span>
              <Button variant="primary" shortcut="Ctrl ↵" busy={closing} disabled={!data.closing.ready || closing} onClick={onClose}>
                {`Close ${month}`}
              </Button>
            </div>
          </>
        ) : null}
        <div className="group-head" style={{ paddingTop: 24 }}>
          <h2>Periods</h2>
        </div>
        {data.periods.length === 0 ? (
          <p className="muted" style={{ padding: "0 24px" }}>
            No period yet. Open the first one.
          </p>
        ) : (
          <div className="wt" style={{ flex: "none" }}>
            <table className="table" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Opens</th>
                  <th>Closes</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.periods.map((period) => (
                  <tr key={period.id}>
                    <td>
                      <span className="cell-lead">{period.name}</span>
                    </td>
                    <td className="muted">{period.opens}</td>
                    <td className="muted">{period.closes}</td>
                    <td>
                      <span className={PERIOD_STATUS[period.state].cls}>{PERIOD_STATUS[period.state].label}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {period.state === "closed" ? (
                        <Button variant="quiet" size="sm" onClick={() => onReopen(period.id)}>
                          Reopen
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <aside className="kaside" style={{ width: 320 }} aria-label="Closing controls">
        <b style={{ color: "var(--color-ink)" }}>Closing controls</b>
        <Field label="Retained earnings account" htmlFor="close-re">
          <Select
            id="close-re"
            value={controls.retainedEarningsAccountId}
            onChange={(event) => setControls((current) => ({ ...current, retainedEarningsAccountId: event.target.value }))}
          >
            <option value="">Choose an account</option>
            {data.controls.equityAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} {account.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Freeze postings before" htmlFor="close-freeze">
          <Input
            id="close-freeze"
            type="date"
            value={controls.freezeBeforeDate}
            onChange={(event) => setControls((current) => ({ ...current, freezeBeforeDate: event.target.value }))}
          />
        </Field>
        <Field label="Before the freeze" htmlFor="close-policy">
          <Select
            id="close-policy"
            value={controls.policy}
            onChange={(event) => setControls((current) => ({ ...current, policy: event.target.value as ClosingControls["policy"] }))}
          >
            {(Object.keys(POLICY_LABEL) as Array<keyof typeof POLICY_LABEL>).map((policy) => (
              <option key={policy} value={policy}>
                {POLICY_LABEL[policy]}
              </option>
            ))}
          </Select>
        </Field>
        <span>
          <Button busy={saving} disabled={saving} onClick={() => onSaveControls(controls)}>
            Save controls
          </Button>
        </span>
      </aside>
    </div>
  );
}
