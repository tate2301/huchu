"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { money } from "@/lib/books/format";
import { PERIOD_LABEL, PERIODS } from "@/lib/books/period";
import { REQUISITION_TAB_LABEL, REQUISITION_VIEWS, type RequisitionQuery, type RequisitionRow, type RequisitionsPage } from "@/lib/books/requisitions-list";

import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const SOURCE_WORD = { crm: "CRM", retail: "Retail" } as const;

/** Of a selection, what Approve does and what it skips, and why (shown before it is pressed). */
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
 * Books → Bills & spending → Requisitions (design/core-modules/boards/view/BkRequisitions.html):
 * the CRM's and the shop's as one list, with where each came from. A selection
 * is approved or rejected; the bar says before it is pressed which it skips
 * and why (your own, or over the limit for anyone but the owner).
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
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const plan = approvable(selected, data.me, data.owner);
  const person = data.people.find((option) => option.id === query.person);
  const { from, to, of } = data.range;
  const filtered = Boolean(query.q || query.source || query.person || query.period !== "any");

  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs label="Requisition views" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={REQUISITION_VIEWS.map((view) => ({ value: view, label: REQUISITION_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search requisitions"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={`${of.toLocaleString("en-GB")} ${query.view === "all" ? (of === 1 ? "requisition" : "requisitions") : REQUISITION_TAB_LABEL[query.view].toLowerCase()}`}
        chips={
          <>
            <BkChip
              label="From"
              value={query.source ? SOURCE_WORD[query.source] : "CRM and retail"}
              set={Boolean(query.source)}
              items={[
                { key: "any", label: "CRM and retail", checked: !query.source, onSelect: () => onQuery({ source: null, page: 1 }) },
                { separator: true },
                { key: "crm", label: "CRM", checked: query.source === "crm", onSelect: () => onQuery({ source: "crm", page: 1 }) },
                { key: "retail", label: "Retail", checked: query.source === "retail", onSelect: () => onQuery({ source: "retail", page: 1 }) },
              ]}
            />
            <BkChip
              label="Asked by"
              value={person?.name ?? "Anyone"}
              set={Boolean(person)}
              items={[
                { key: "any", label: "Anyone", checked: !query.person, onSelect: () => onQuery({ person: null, page: 1 }) },
                { separator: true },
                ...data.people.map((option) => ({ key: option.id, label: <Person name={option.name} src={option.image} />, checked: query.person === option.id, onSelect: () => onQuery({ person: option.id, page: 1 }) })),
              ]}
            />
          </>
        }
        filters={PERIODS.map((period) => ({ key: period, label: PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
        end={<BkQuietTools onSort={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })} sortLabel={query.sort === "newest" ? "Sort" : "Oldest first"} exportHref={exportHref} />}
      />
      <TableShell
        label="Requisitions"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
            sums={[{ label: "To approve", value: money(data.toApprove, data.currency) }]}
            page={{
              onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
              onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
            }}
            selection={{
              count: selected.length,
              sum: { label: "Total", value: money(selected.reduce((sum, row) => sum + row.amount, 0), data.currency) },
              onClear: selection.clear,
              note: plan.note,
              actions: data.can.approve ? (
                <>
                  <Button icon="check" disabled={!plan.go.length} onClick={() => onApprove(plan.go)}>
                    Approve {plan.go.length}
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
            <p className="muted">{filtered ? "Clear the search or the filters to see the rest." : "Requisitions from the CRM and the shop land here as they are asked."}</p>
          </div>
        ) : (
          <table className="table" aria-label="Requisitions">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 100 }} />
              <col />
              <col style={{ width: 100 }} />
              <col style={{ width: 140 }} />
            </colgroup>
            <thead>
              <tr>
                <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                <th>Requisition</th>
                <th>Asked by</th>
                <th>From</th>
                <th>For</th>
                <th>Asked</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
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
                  <td>
                    <span className="pill pill-n">{row.source}</span>
                  </td>
                  <td className="fill truncate">
                    <span className="cell-lead">{row.purpose}</span>
                  </td>
                  <td className="muted">{row.asked}</td>
                  <td className="num">{money(row.amount, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}
