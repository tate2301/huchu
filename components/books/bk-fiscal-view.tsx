"use client";

import * as React from "react";

import { Button, Person, TableFoot, TableShell } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { FISCAL_KINDS, type FiscalTab } from "@/lib/books/fiscal-labels";
import type { FiscalPage, FiscalRow } from "@/lib/books/fiscal-page";
import { money } from "@/lib/books/format";

import { Lead, St, TableEmpty } from "./bk-b";
import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

/**
 * Books → Tax → Fiscal register (design/core-modules/boards/view/BkFiscal.html):
 * six columns, the kind under the number, the fiscal day under the time, the
 * verification code (or how often it was tried) under the FDMS result; a
 * failed one is retried from its row. Setup is in Management.
 */
export function BkFiscalView({
  data,
  q,
  kind,
  status,
  onQuery,
  onRetry,
  retrying,
  more,
  exportHref,
}: {
  data: FiscalPage;
  q: string;
  kind: string | null;
  status: string | null;
  onQuery: (next: { tab?: FiscalTab; q?: string; kind?: string | null; status?: string | null; page?: number }) => void;
  onRetry: (row: FiscalRow) => void;
  retrying: string | null;
  more: (row: FiscalRow) => MenuEntry[];
  exportHref: string;
}) {
  const { from, to, of, page } = data.range;
  const kindLabel = FISCAL_KINDS.find((row) => row.value === kind)?.label;
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs
        label="Fiscal register"
        value={data.tab}
        onChange={(tab) => onQuery({ tab, page: 1 })}
        items={[
          { value: "documents", label: "Documents", count: data.counts.documents },
          { value: "days", label: "Fiscal days", count: data.counts.days },
          { value: "failed", label: "Failed", count: data.counts.failed },
        ]}
      />
      <BkTools
        find="Search fiscal documents"
        query={q}
        onFind={(next) => onQuery({ q: next, page: 1 })}
        chips={
          <>
            <BkChip label="Kind" value={kindLabel ?? "All"} set={Boolean(kindLabel)} items={[{ key: "all", label: "All", checked: !kind, onSelect: () => onQuery({ kind: null, page: 1 }) }, { separator: true }, ...FISCAL_KINDS.map((row) => ({ key: row.value, label: row.label, checked: row.value === kind, onSelect: () => onQuery({ kind: row.value, page: 1 }) }))]} />
            <BkChip label="FDMS" value={status ?? "Any"} set={Boolean(status)} items={[{ key: "any", label: "Any", checked: !status, onSelect: () => onQuery({ status: null, page: 1 }) }, { separator: true }, ...["Valid", "Failed", "Pending"].map((word) => ({ key: word, label: word, checked: status === word, onSelect: () => onQuery({ status: word, page: 1 }) }))]} />
          </>
        }
        count={data.tab === "days" ? `${data.days.length} fiscal days` : `${of.toLocaleString("en-GB")} ${of === 1 ? "document" : "documents"}`}
        end={<BkQuietTools exportHref={exportHref} />}
      />
      {data.tab === "days" ? (
        <TableShell label="Fiscal days" foot={<TableFoot range={`${data.days.length} fiscal days`} sums={[{ label: "Open", value: String(data.days.filter((day) => day.status === "Open").length) }]} />}>
          {data.days.length === 0 ? (
            <TableEmpty title="No fiscal day yet">{data.hasDevice ? "The device opens a day with the first sale it signs." : "Set up the fiscal device in Management › Shop › Fiscal device."}</TableEmpty>
          ) : (
            <table className="table" aria-label="Fiscal days">
              <colgroup>
                <col style={{ width: 140 }} />
                <col />
                <col style={{ width: 200 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Fiscal day</th>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th className="num">Receipts</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => (
                  <tr key={day.id}>
                    <td>
                      <span className="cell-lead">Day {day.no}</span>
                    </td>
                    <td className="fill muted">{day.opened}</td>
                    <td className="muted truncate" title={day.error ?? undefined}>
                      {day.closed ?? (day.error ? day.error : "—")}
                    </td>
                    <td className="num">{day.receipts}</td>
                    <td>
                      <St word={day.status === "Open" ? "Open" : day.status === "Closing" ? "Closing" : "Closed"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      ) : (
        <TableShell
          label="Fiscal documents"
          foot={
            <TableFoot
              range={of === 0 ? "None" : `${from} to ${to} of ${of.toLocaleString("en-GB")}`}
              sums={[
                { label: "Valid", value: data.sums.valid.toLocaleString("en-GB") },
                { label: "Failed", value: data.sums.failed.toLocaleString("en-GB") },
              ]}
              page={{ onPrevious: page > 1 ? () => onQuery({ page: page - 1 }) : undefined, onNext: to < of ? () => onQuery({ page: page + 1 }) : undefined }}
            />
          }
        >
          {data.rows.length === 0 ? (
            <TableEmpty title={data.tab === "failed" ? "Nothing failed" : q ? "No document matches" : "Nothing sent yet"}>
              {data.tab === "failed" ? "Every document sent to the device is signed." : data.hasDevice ? "Issued invoices, credit notes and till sales are sent to the device as they are made." : "Set up the fiscal device in Management › Shop › Fiscal device."}
            </TableEmpty>
          ) : (
            <table className="table" aria-label="Fiscal documents">
              <colgroup>
                <col style={{ width: 140 }} />
                <col />
                <col style={{ width: 160 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Number</th>
                  <th className="fill">Customer</th>
                  <th>Sent</th>
                  <th className="num">Amount</th>
                  <th>FDMS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className={row.status === "Failed" ? "bk-sel" : undefined}>
                    <td>
                      <Lead sub={row.kind}>{row.number}</Lead>
                    </td>
                    <td className="fill truncate" style={{ height: 52 }}>
                      {row.customer ? (
                        <span className="cell-lead">
                          <Person name={row.customer} />
                        </span>
                      ) : (
                        <span className="muted">Walk-in</span>
                      )}
                    </td>
                    <td>
                      <Lead sub={row.day !== null ? `Fiscal day ${row.day}` : "No fiscal day"}>{row.sent}</Lead>
                    </td>
                    <td className="num">{row.amount === null ? <span className="muted">—</span> : money(row.amount, row.currency)}</td>
                    <td title={row.error ?? undefined}>
                      <St word={row.status} />
                      <span className={row.code ? "sub mono" : "sub"} style={{ display: "block", fontSize: 12, color: "var(--color-muted)" }}>
                        {row.status === "Valid" ? (row.code ?? "Signed") : `Tried ${row.attempts} ${row.attempts === 1 ? "time" : "times"}`}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {row.status !== "Valid" ? (
                        <Button size="sm" icon="arrow" busy={retrying === row.id} disabled={Boolean(retrying)} onClick={() => onRetry(row)}>
                          Retry
                        </Button>
                      ) : (
                        <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" label={`More for ${row.number}`} aria-label={`More for ${row.number}`} items={more(row)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      )}
    </div>
  );
}
