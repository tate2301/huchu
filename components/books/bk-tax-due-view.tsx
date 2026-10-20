"use client";

import * as React from "react";

import { Button, TableFoot, TableShell } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import type { DuePage, DueRow } from "@/lib/books/tax-due";
import { DUE_TAX_LABEL, type DueTax } from "@/lib/books/tax-labels";

import { Lead, St, TableEmpty, ToConfirm } from "./bk-b";
import { BkChip, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const TAXES: Array<DueTax | "all"> = ["all", "vat", "paye", "wht", "qpd", "income"];

/** The month windows the Months chip offers: from this month, three or six ahead; the year. */
export function monthWindows(today: string) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const span = (from: number, months: number) => ({ from: iso(new Date(Date.UTC(y, from - 1, 1))), to: iso(new Date(Date.UTC(y, from - 1 + months, 0))) });
  return [
    { key: "3", label: "The next 3 months", ...span(m, 3) },
    { key: "6", label: "The next 6 months", ...span(m, 6) },
    { key: "back", label: "The last 3 months", ...span(m - 3, 3) },
    { key: "year", label: `${y}`, from: `${y}-01-01`, to: `${y}-12-31` },
  ];
}

/**
 * Books → Tax → What's due (design/core-modules/boards/view/BkTaxDue.html and
 * BkTaxDuePhone): the table is the calendar, a row per date grouped by month,
 * the period under each line and "To confirm" on a date the research could
 * not confirm.
 */
export function BkTaxDueView({
  data,
  q,
  today,
  onQuery,
  onCalendar,
  more,
}: {
  data: DuePage;
  q: string;
  today: string;
  onQuery: (next: { tax?: DueTax | "all"; q?: string; from?: string | null; to?: string | null }) => void;
  onCalendar: () => void;
  more: MenuEntry[];
}) {
  const c = data.baseCurrency;
  const windows = monthWindows(today);
  const rowsOf = (rows: DueRow[]) =>
    rows.map((row) => (
      <tr key={`${row.date}-${row.kind}`}>
        <td className="muted">{row.day}</td>
        <td className="fill">
          <Lead sub={row.period}>
            {row.what}
            {row.toConfirm ? (
              <>
                {" "}
                <ToConfirm why={row.why} />
              </>
            ) : null}
          </Lead>
        </td>
        <td className="num">{row.amount === null ? <span className="muted">—</span> : money(row.amount, c)}</td>
        <td className="truncate muted">{row.settledBy}</td>
        <td>
          <St word={row.state} />
        </td>
      </tr>
    ));
  const all = data.groups.flatMap((group) => group.rows);
  return (
    <>
      <div className="bk bk-desk-only">
        <BooksFinding finding={data.finding} />
        <BkTools
          find="Search what’s due"
          query={q}
          onFind={(next) => onQuery({ q: next })}
          chips={
            <>
              <BkChip label="Tax" value={DUE_TAX_LABEL[data.tax]} set={data.tax !== "all"} items={TAXES.map((tax) => ({ key: tax, label: DUE_TAX_LABEL[tax], checked: data.tax === tax, onSelect: () => onQuery({ tax }) }))} />
              <BkChip label="Months" value={data.monthsWords} set items={windows.map((window) => ({ key: window.key, label: window.label, checked: data.from === window.from && data.to === window.to, onSelect: () => onQuery(window.key === "3" ? { from: null, to: null } : { from: window.from, to: window.to }) }))} />
            </>
          }
          count={`${data.count} ${data.count === 1 ? "date" : "dates"}`}
          end={
            <>
              <Button icon="calendar" disabled={all.length === 0} onClick={onCalendar}>
                Add to my calendar
              </Button>
              <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" label="Export" aria-label="Export" items={more} />
            </>
          }
        />
        <TableShell
          label="What’s due"
          foot={<TableFoot range={`${data.dueCount} due${data.lastDue ? ` by ${data.lastDue}` : ""}`} sums={data.sums.map((sum) => ({ label: sum.label, value: money(sum.value, c) }))} />}
        >
          {all.length === 0 ? (
            <TableEmpty title="Nothing due in these months">Choose other months, or another tax.</TableEmpty>
          ) : (
            <table className="table" aria-label="What’s due">
              <colgroup>
                <col style={{ width: 120 }} />
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>What</th>
                  <th className="num">Amount</th>
                  <th>Settled by</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((group) => (
                  <React.Fragment key={group.month}>
                    <tr className="grp">
                      <td colSpan={5}>
                        {group.month}
                        <span className="n">{group.note}</span>
                      </td>
                    </tr>
                    {rowsOf(group.rows)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      </div>
      <div className="bk-ph-only">
        <div className="bk-ph-b" style={{ gap: 4 }}>
          <div className="bk-ph-t">{data.nextMonth.total > 0 ? `${money(data.nextMonth.total, c)} to pay in ${data.nextMonth.name}` : "Nothing to pay soon"}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {data.monthsWords}
          </div>
          <div className="bk-ph-list" style={{ marginTop: 12 }}>
            {all
              .filter((row) => row.state !== "Paid" && row.state !== "Filed")
              .slice(0, 8)
              .map((row) => (
                <div key={`${row.date}-${row.kind}`} style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) auto", gap: 12, alignItems: "start", padding: "14px 16px", boxShadow: "inset 0 -1px 0 var(--color-line)" }}>
                  <div style={{ textAlign: "center", borderRadius: 8, boxShadow: "var(--shadow-ring)", padding: "6px 0" }}>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {row.day.split(" ")[2]}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)" }}>{row.day.split(" ")[1]}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)", lineHeight: "20px" }}>{row.what}</b>
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                      {row.period}
                    </div>
                    {row.toConfirm ? (
                      <div style={{ marginTop: 6 }}>
                        <ToConfirm why={row.why} />
                      </div>
                    ) : null}
                  </div>
                  <b className="mono" style={{ fontSize: 14, color: "var(--color-ink)", lineHeight: "20px" }}>
                    {row.amount === null ? "—" : money(row.amount, c)}
                  </b>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
