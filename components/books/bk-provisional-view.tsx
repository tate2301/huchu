"use client";

import * as React from "react";

import { Button, TableFoot, TableShell } from "@/components/core";
import { money } from "@/lib/books/format";
import type { ProvisionalPage } from "@/lib/books/provisional-page";

import { Lead, n2, Rail, RailSec, Split, St, ToConfirm } from "./bk-b";
import { BkTabs } from "./bk-list";
import { BooksFinding } from "./figures";

/**
 * Books → Tax → Provisional tax (design/core-modules/boards/view/BkProvisionalTax.html):
 * the four instalments of the year against the estimate, which payment paid
 * each; the estimate and the payment dates in the rail.
 */
export function BkProvisionalView({ data, onYear, onRevise, onDates, exportHref }: { data: ProvisionalPage; onYear: (year: number) => void; onRevise: () => void; onDates: () => void; exportHref: string }) {
  const c = data.baseCurrency;
  const total = data.estimate?.taxUsd ?? 0;
  return (
    <Split
      rail={
        <Rail label="The estimate" width={360}>
          <RailSec
            title="The estimate"
            figure={data.estimate ? money(total, c) : "None yet"}
            rows={[
              ["Worked from", data.estimate?.incomeUsd ? `Income of about ${money(data.estimate.incomeUsd, c)}` : "The tax you expect to owe"],
              ["Rates", data.rates],
              ["Currency split", data.estimate?.split5050 ? "50/50, $ and ZWG" : "Off"],
              ["Last revised", data.estimate?.revisedAt ? `${data.estimate.revisedAt}${data.estimate.revisedBy ? `, ${data.estimate.revisedBy.split(" ")[0]}` : ""}` : "—"],
            ]}
            after={
              <Button icon="edit" onClick={onRevise}>
                Revise the estimate
              </Button>
            }
          />
          <RailSec
            title="Payment dates"
            end={data.toConfirm ? <ToConfirm why={data.why} /> : undefined}
            rows={data.rows.map((row) => [row.name.replace(" instalment", ""), row.date] as [string, string])}
            after={
              <Button icon="gear" onClick={onDates}>
                Set the dates
              </Button>
            }
          />
        </Rail>
      }
    >
      <BooksFinding finding={data.finding} />
      <BkTabs label="Years" value={String(data.year)} onChange={(year) => onYear(Number(year))} items={data.years.map((year) => ({ value: String(year), label: String(year) }))} />
      <TableShell
        label="Instalments"
        foot={
          <TableFoot
            range={`Year to 31 Dec ${data.year}`}
            sums={[
              { label: "Paid", value: money(data.paid, c) },
              { label: "Still due", value: money(data.stillDue, c) },
            ]}
            end={
              <a className="btn btn-quiet" href={exportHref} download>
                Export
              </a>
            }
          />
        }
      >
        <table className="table" aria-label="Instalments">
          <colgroup>
            <col style={{ width: 170 }} />
            <col />
            <col style={{ width: 90 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Instalment</th>
              <th className="fill">Date</th>
              <th className="num">Share</th>
              <th className="num">Amount</th>
              <th>Paid by</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.number}>
                <td>
                  <Lead>{row.name}</Lead>
                </td>
                <td className="fill">
                  <span className="muted">{row.date}</span>
                  {row.toConfirm ? (
                    <>
                      {" "}
                      <ToConfirm why={data.why} />
                    </>
                  ) : null}
                </td>
                <td className="num muted">{row.share}%</td>
                <td className="num">{row.amount === null ? <span className="muted">—</span> : n2(row.amount)}</td>
                <td className="truncate">{row.paidBy ? <span className="ref">{row.paidBy}</span> : <span className="muted">—</span>}</td>
                <td>
                  <St word={row.state === "Part paid" ? "Due" : row.state} label={row.state} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="tot">
              <td>4 instalments</td>
              <td className="fill" />
              <td className="num">100%</td>
              <td className="num">{n2(total)}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </TableShell>
    </Split>
  );
}
