"use client";

import * as React from "react";
import Link from "next/link";

import { Person, TableFoot, TableShell } from "@/components/core";
import { AUDIT_DATES, AUDIT_DATES_LABEL, AUDIT_KIND_LABEL, AUDIT_KINDS, type AuditPage, type AuditQuery } from "@/lib/books/audit";

import { Lead, Rail, RailSec, Split, TableEmpty } from "./bk-b";
import { BkChip, BkQuietTools, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

/**
 * Books → Ledger → Audit trail (design/core-modules/boards/view/BkAudit.html):
 * the changes to posted records with who, what and why; the chosen one in
 * the rail with the operator when it was one, and what was kept with the
 * chain's state.
 */
export function BkAuditView({ data, onQuery, exportHref }: { data: AuditPage; onQuery: (next: Partial<AuditQuery>) => void; exportHref: string }) {
  const q = data.query;
  const pick = data.selected;
  const { from, to, of } = data.range;
  return (
    <Split
      rail={
        <Rail label="The chosen change" width={360}>
          {pick ? (
            <>
              <section>
                <div className="sec-title">{pick.what}</div>
                <div className="bk-mut">
                  {pick.when}
                  {pick.who.session ? ` · session ${pick.who.session}` : ""}
                </div>
                <dl className="attrs">
                  {pick.who.operator ? (
                    <>
                      <dt>Operator</dt>
                      <dd>{pick.who.operator}</dd>
                      <dt>Mode</dt>
                      <dd>Change</dd>
                    </>
                  ) : (
                    <>
                      <dt>By</dt>
                      <dd>
                        <Person name={pick.who.name} src={pick.who.image} />
                        {pick.who.sub ? <span className="muted">, {pick.who.sub.toLowerCase()}</span> : null}
                      </dd>
                    </>
                  )}
                  <dt>Record</dt>
                  <dd>{pick.href ? <Link href={pick.href}>{pick.detail ?? "Open it"}</Link> : (pick.detail ?? "—")}</dd>
                  <dt>Reason</dt>
                  <dd>{pick.reason ?? "—"}</dd>
                </dl>
              </section>
              <RailSec title="What was kept" end={data.chainUnbroken && pick.chained ? <span className="status status-success">Chain unbroken</span> : <span className="status status-danger">Chain broken: tell Corelith</span>} after={pick.kept ? <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}>{pick.kept}</pre> : <span className="muted">Who, when and why.</span>} />
            </>
          ) : (
            <RailSec title="Nothing chosen" after={<span className="muted">Choose a change to see what was kept.</span>} />
          )}
        </Rail>
      }
    >
      <BooksFinding finding={data.finding} />
      <BkTools
        find="Search the audit trail"
        query={q.q}
        onFind={(next) => onQuery({ q: next, page: 1 })}
        count={`${of} events`}
        chips={
          <>
            <BkChip label="Kind" value={AUDIT_KIND_LABEL[q.kind]} set={q.kind !== "all"} items={AUDIT_KINDS.map((kind) => ({ key: kind, label: AUDIT_KIND_LABEL[kind], checked: kind === q.kind, onSelect: () => onQuery({ kind, page: 1 }) }))} />
            <BkChip label="Dates" value={AUDIT_DATES_LABEL[q.dates]} set={q.dates !== "all"} items={AUDIT_DATES.map((dates) => ({ key: dates, label: AUDIT_DATES_LABEL[dates], checked: dates === q.dates, onSelect: () => onQuery({ dates, page: 1 }) }))} />
          </>
        }
        end={<BkQuietTools exportHref={exportHref} />}
      />
      <TableShell
        label="Audit trail"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from === 1 ? "" : `${from} to `}${to} of ${of} events`}
            sums={[
              { label: "Voids", value: data.sums.void },
              { label: "Revisions", value: data.sums.revise },
              { label: "Deletes", value: data.sums.delete },
            ]}
            page={{ onPrevious: q.page > 1 ? () => onQuery({ page: q.page - 1 }) : undefined, onNext: to < of ? () => onQuery({ page: q.page + 1 }) : undefined }}
          />
        }
      >
        {data.rows.length === 0 ? (
          <TableEmpty title={q.q || q.kind !== "all" ? "No change matches" : "No changes to posted records"}>{q.q || q.kind !== "all" ? "Clear the search or the Kind to see the rest." : "Try Any time in Dates."}</TableEmpty>
        ) : (
          <table className="table" aria-label="Audit trail">
            <colgroup>
              <col style={{ width: 130 }} />
              <col style={{ width: 190 }} />
              <col style={{ width: 190 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} aria-selected={row.id === pick?.id || undefined} className={row.id === pick?.id ? "bk-sel" : undefined} tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onQuery({ event: row.id })} onKeyDown={(event) => event.key === "Enter" && onQuery({ event: row.id })}>
                  <td>
                    <span className="muted">{row.when}</span>
                  </td>
                  <td className="truncate">
                    {row.who.operator ? (
                      <Lead sub={row.who.sub}>{row.who.name}</Lead>
                    ) : (
                      <Lead sub={row.who.sub}>
                        <Person name={row.who.name} src={row.who.image} />
                      </Lead>
                    )}
                  </td>
                  <td className="truncate">
                    <Lead sub={row.detail}>{row.what}</Lead>
                  </td>
                  <td className="fill bk-fw">{row.reason ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </Split>
  );
}
