"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { money } from "@/lib/books/format";
import { PERIOD_LABEL, PERIODS } from "@/lib/books/period";
import { REQUISITION_TAB_LABEL, REQUISITION_VIEWS, REQUISITIONS_PAGE_SIZE, type RequisitionQuery, type RequisitionRow, type RequisitionsPage } from "@/lib/books/requisitions-list";

import { BkChip, BkQuietTools, BkState, BkTabs, BkTools, useBkLayout } from "./bk-list";
import { Cents } from "./figures";

const SOURCE_WORD = { crm: "CRM", retail: "Retail" } as const;

const TONE: Record<RequisitionRow["status"], Parameters<typeof BkState>[0]["tone"]> = {
  DRAFT: "plain",
  SUBMITTED: "warning",
  APPROVED: "info",
  REJECTED: "void",
  DISBURSED: "info",
  ACQUITTED: "success",
  CANCELLED: "void",
};

/** The totals row: on the fill, sticking to the bottom of the scroll, as the design draws it. */
const footCell: React.CSSProperties = { position: "sticky", bottom: 0, zIndex: 1, height: 40, background: "var(--color-fill)", color: "var(--color-ink)", fontWeight: 600, whiteSpace: "nowrap" };

/**
 * Of a selection, what Approve does and what it skips, and why. The rules:
 * nobody approves their own; over the limit it asked under (snapshotted when it
 * was sent) only the owner approves it; the person who approves is not the one
 * who pays out, which Pay out enforces on its own.
 */
export function approvable(rows: RequisitionRow[], me: string, owner: boolean) {
  const waiting = rows.filter((row) => row.status === "SUBMITTED");
  const own = waiting.filter((row) => row.askedBy.id === me);
  const over = owner ? [] : waiting.filter((row) => row.askedBy.id !== me && row.overLimit);
  const go = waiting.filter((row) => row.askedBy.id !== me && !over.includes(row));
  const notes = [
    own.length ? `${own.map((row) => row.number).join(", ")} ${own.length === 1 ? "is" : "are"} yours, so ${own.length === 1 ? "it is" : "they are"} skipped` : null,
    over.length ? `${over.map((row) => row.number).join(", ")} ${over.length === 1 ? "is" : "are"} over the limit, for the owner` : null,
  ].filter(Boolean);
  return { go, skipped: [...own, ...over], note: notes.join("; ") || null };
}

/**
 * Books → Bills & spending → Requisitions (design/books/html/bk-requisitions.html):
 * the CRM's and the shop's as one list. Select, Number, Who, For, Job, Source,
 * State and Amount, a totals row, and with rows selected the selection bar:
 * Approve (A) and Reject, Esc clears.
 */
export function BkRequisitionsView({
  data,
  onQuery,
  exportHref,
  onApprove,
  onReject,
}: {
  data: RequisitionsPage;
  onQuery: (next: Partial<RequisitionQuery>) => void;
  exportHref: string;
  onApprove: (rows: RequisitionRow[]) => void;
  onReject: (rows: RequisitionRow[]) => void;
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const source = React.useMemo(() => data.rows, [data.rows]);
  const layout = useBkLayout(
    "requisitions",
    [
      { key: "who", label: "Who", nth: 3 },
      { key: "for", label: "For", nth: 4 },
      { key: "job", label: "Job", nth: 5 },
      { key: "source", label: "Source", nth: 6 },
      { key: "state", label: "State", nth: 7 },
    ],
    [
      { key: "who", label: "Who", by: (row: RequisitionRow) => row.askedBy.name },
      { key: "job", label: "Job", by: (row: RequisitionRow) => row.job ?? "No job" },
      { key: "source", label: "Source", by: (row: RequisitionRow) => row.source },
      { key: "state", label: "State", by: (row: RequisitionRow) => row.state },
    ],
    source,
  );
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const plan = approvable(selected, data.me, data.owner);
  const person = data.people.find((option) => option.id === query.person);
  const { from, to, of } = data.range;
  const filtered = Boolean(query.q || query.source || query.person || query.period !== "any");
  const whole = of <= REQUISITIONS_PAGE_SIZE;

  return (
    <div className="bk">
      <BkTabs label="Requisition views" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={REQUISITION_VIEWS.map((view) => ({ value: view, label: REQUISITION_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search requisitions"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={of.toLocaleString("en-GB")}
        chips={
          <>
            <BkChip
              label="Source"
              value={query.source ? SOURCE_WORD[query.source] : "CRM, Retail"}
              set={Boolean(query.source)}
              items={[
                { key: "any", label: "CRM, Retail", checked: !query.source, onSelect: () => onQuery({ source: null, page: 1 }) },
                { separator: true },
                { key: "crm", label: "CRM", checked: query.source === "crm", onSelect: () => onQuery({ source: "crm", page: 1 }) },
                { key: "retail", label: "Retail", checked: query.source === "retail", onSelect: () => onQuery({ source: "retail", page: 1 }) },
              ]}
            />
            <BkChip
              label="Person"
              value={person?.name ?? "Any"}
              set={Boolean(person)}
              items={[
                { key: "any", label: "Any person", checked: !query.person, onSelect: () => onQuery({ person: null, page: 1 }) },
                { separator: true },
                ...data.people.map((option) => ({ key: option.id, label: <Person name={option.name} src={option.image} />, checked: query.person === option.id, onSelect: () => onQuery({ person: option.id, page: 1 }) })),
              ]}
            />
          </>
        }
        filters={PERIODS.map((period) => ({ key: period, label: PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
        end={<BkQuietTools middle={layout.tools} onSort={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })} sortLabel={query.sort === "newest" ? "Sort" : "Oldest first"} exportHref={exportHref} />}
      />
      <div className={layout.wrap} style={{ display: "contents" }}>
        {layout.style}
        <TableShell
          label="Requisitions"
          foot={
            <TableFoot
              range={whole ? undefined : `${from} to ${to} of ${of}`}
              page={
                whole
                  ? undefined
                  : {
                      onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
                      onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
                    }
              }
              selection={{
                count: selected.length,
                sum: { label: "Asking", value: money(selected.reduce((sum, row) => sum + row.amount, 0), data.currency) },
                onClear: selection.clear,
                note: plan.note,
                actions:
                  selected.length > 0 && data.can.approve ? (
                    <>
                      <Button icon="check" shortcut="A" disabled={!plan.go.length} onClick={() => onApprove(plan.go)}>
                        Approve
                      </Button>
                      <Button icon="x" disabled={!plan.go.length} onClick={() => onReject(plan.go)}>
                        Reject
                      </Button>
                    </>
                  ) : undefined,
              }}
            />
          }
        >
          {data.rows.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>{filtered ? "No requisition matches" : query.view === "to-approve" ? "Nothing waits for approval" : `Nothing ${REQUISITION_TAB_LABEL[query.view].toLowerCase()}`}</b>
              {filtered ? <p className="muted">Clear the search or the filters to see the rest.</p> : null}
            </div>
          ) : (
            <table className="table" aria-label="Requisitions">
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 200 }} />
                <col />
                <col style={{ width: 200 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 128 }} />
              </colgroup>
              <thead>
                <tr>
                  <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every requisition" />
                  <th>Number</th>
                  <th>Who</th>
                  <th>For</th>
                  <th>Job</th>
                  <th>Source</th>
                  <th>State</th>
                  <th className="num">Amount, {data.currency}</th>
                </tr>
              </thead>
              <tbody>
                {layout.rows((row) => (
                  <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                    <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
                    <td>
                      <Link className="ref" href={`/books/requisitions/${row.id}`}>
                        {row.number}
                      </Link>
                    </td>
                    <td className="truncate">
                      <span className="cell-lead">
                        <Person name={row.askedBy.name} src={row.askedBy.image} />
                      </span>
                    </td>
                    <td className="truncate">{row.purpose}</td>
                    <td className="truncate muted">{row.job ?? "—"}</td>
                    <td>{row.source}</td>
                    <td>
                      <BkState tone={TONE[row.status]}>{row.state}</BkState>
                    </td>
                    <td className="num">
                      <Cents value={row.amount} currency={row.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={footCell} />
                  <td style={footCell} colSpan={6}>
                    {of === 1 ? "1 requisition" : `${of.toLocaleString("en-GB")} requisitions`}
                  </td>
                  <td style={footCell} className="num">
                    {whole ? <Cents value={data.rows.reduce((sum, row) => sum + row.amount, 0)} currency={data.currency} /> : null}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </TableShell>
      </div>
    </div>
  );
}
