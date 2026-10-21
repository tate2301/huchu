"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Icon } from "@/components/core";
import type { CloseCheck, CloseView } from "@/lib/books/close";

import { BkTabs } from "./bk-list";
import { BooksFinding } from "./figures";

type CloseTab = "month" | "all";

const ACTION_ICON: Partial<Record<CloseCheck["key"], "pen" | "arrow">> = { postings: "pen" };

/**
 * Books → Close the month → Checklist (design/books/html/bk-close.html): the
 * finding, then the month's checks as full-width bands, failures first, each
 * with the action that clears it; the other tab lists every month with its
 * voucher. Close and Freeze are in the bar.
 */
export function ClosePageView({ data, onReopen }: { data: CloseView; onReopen: (periodId: string) => void }) {
  const [tab, setTab] = React.useState<CloseTab>("month");
  return (
    <div className="bk bkc">
      <BooksFinding finding={data.finding} />
      <BkTabs
        label="Close the month"
        value={tab}
        onChange={setTab}
        items={[
          { value: "month", label: "This month" },
          { value: "all", label: "All months", count: data.periods.length },
        ]}
      />
      {tab === "month" ? (
        data.closing ? (
          <div className="bkc-list">
            {data.closing.checks.map((check) => {
              const bad = check.state !== "done";
              return (
                <div className={bad ? "bkc-ck is-bad" : "bkc-ck"} key={check.key}>
                  <span className="bkc-i">
                    <Icon name={bad ? "x" : "done"} />
                  </span>
                  <span className="bkc-t">
                    <b>{check.label}</b>
                    {check.note ? <span>{check.note}</span> : null}
                  </span>
                  {check.action ? (
                    <Link className="btn" href={check.action.href}>
                      <Icon name={ACTION_ICON[check.key] ?? "arrow"} />
                      {check.action.label}
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : data.closed ? (
          <div className="bkc-list">
            <div className="bkc-ck">
              <span className="bkc-i">
                <Icon name="lock" />
              </span>
              <span className="bkc-t">
                <b>{data.closed.month} is closed</b>
                <span>{data.closed.voucher}</span>
              </span>
              <Button onClick={() => onReopen(data.closed!.id)}>Reopen {data.closed.month}</Button>
            </div>
          </div>
        ) : null
      ) : data.periods.length === 0 ? (
        <div className="bkc-list">
          <div className="bkc-ck">
            <span className="bkc-t">
              <b>No month yet</b>
            </span>
          </div>
        </div>
      ) : (
        <div className="bkd-wrap">
          <table className="table bkd" aria-label="All months">
            <colgroup>
              <col />
              <col style={{ width: 140 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Month</th>
                <th>Opens</th>
                <th>Closes</th>
                <th>State</th>
                <th>Voucher</th>
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
                  <td>{period.state === "closed" ? <span className="muted">Closed</span> : period.state === "reopened" ? "Reopened" : "Open"}</td>
                  <td>{period.voucher ? <span className="mono">{period.voucher}</span> : <span className="muted">—</span>}</td>
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
  );
}
