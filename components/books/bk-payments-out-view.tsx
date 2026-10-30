"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import { PERIOD_LABEL, PERIODS } from "@/lib/books/period";
import { PAYMENT_OUT_TAB_LABEL, PAYMENT_OUT_VIEWS } from "@/lib/books/payments-out-labels";
import type { PaymentOutQuery, PaymentOutRow, PaymentsOutPage } from "@/lib/books/payments-out";

import { BkChip, BkQuietTools, BkState, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const TONE = { DRAFT: "plain", TO_APPROVE: "warning", APPROVED: "info", PAID: "success", VOIDED: "void" } as const;

/** What a selection can do next, and the rows each move takes. */
export function paymentMoves(rows: PaymentOutRow[], me: string) {
  return {
    approve: rows.filter((row) => row.status === "TO_APPROVE" && row.createdById !== me),
    pay: rows.filter((row) => row.status === "APPROVED"),
    send: rows.filter((row) => row.status === "DRAFT"),
    own: rows.filter((row) => row.status === "TO_APPROVE" && row.createdById === me),
  };
}

/**
 * Books → Bills & spending → Payments made (design/core-modules/boards/view/BkPaymentsOut.html):
 * what was paid this month and what waits for approval, the tabs, the search
 * with Paid to and From, and six columns. A selection is approved, paid or
 * sent for approval as each row allows (D5); the server refuses on its own.
 */
export function BkPaymentsOutView({
  data,
  onQuery,
  exportHref,
  onMove,
  more,
}: {
  data: PaymentsOutPage;
  onQuery: (next: Partial<PaymentOutQuery>) => void;
  exportHref: string;
  onMove: (move: "approve" | "pay" | "submit", rows: PaymentOutRow[]) => void;
  more: (rows: PaymentOutRow[]) => MenuEntry[];
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const moves = paymentMoves(selected, data.me);
  const supplier = data.suppliers.find((option) => option.id === query.supplier);
  const account = data.accounts.find((option) => option.id === query.account);
  const { from, to, of } = data.range;
  const filtered = Boolean(query.q || query.supplier || query.account || query.period !== "any");

  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs label="Payment views" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={PAYMENT_OUT_VIEWS.map((view) => ({ value: view, label: PAYMENT_OUT_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search payments"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={of === 1 ? "1 payment" : `${of.toLocaleString("en-GB")} payments`}
        chips={
          <>
            <BkChip
              label="Paid to"
              value={supplier?.name ?? "Anyone"}
              set={Boolean(supplier)}
              items={[
                { key: "any", label: "Anyone", checked: !query.supplier, onSelect: () => onQuery({ supplier: null, page: 1 }) },
                { separator: true },
                ...data.suppliers.map((option) => ({ key: option.id, label: option.name, checked: query.supplier === option.id, onSelect: () => onQuery({ supplier: option.id, page: 1 }) })),
              ]}
            />
            <BkChip
              label="From"
              value={account?.name ?? "Any account"}
              set={Boolean(account)}
              items={[
                { key: "any", label: "Any account", checked: !query.account, onSelect: () => onQuery({ account: null, page: 1 }) },
                { separator: true },
                ...data.accounts.map((option) => ({ key: option.id, label: option.name, checked: query.account === option.id, onSelect: () => onQuery({ account: option.id, page: 1 }) })),
              ]}
            />
          </>
        }
        filters={PERIODS.map((period) => ({ key: period, label: PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
        end={<BkQuietTools onSort={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })} sortLabel={query.sort === "newest" ? "Sort" : "Oldest first"} exportHref={exportHref} />}
      />
      <TableShell
        label="Payments made"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
            sums={[
              { label: data.month.name, value: money(data.month.paid, data.currency) },
              { label: "IMTT", value: money(data.month.imtt, data.currency) },
              { label: "To approve", value: money(data.waiting, data.currency) },
            ]}
            page={{
              onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
              onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
            }}
            selection={{
              count: selected.length,
              sum: { label: "Total", value: money(selected.filter((row) => row.status !== "VOIDED").reduce((sum, row) => sum + row.amount, 0), data.currency) },
              onClear: selection.clear,
              note: moves.own.length ? `${moves.own.map((row) => (row.number === "Draft" || row.number === "—" ? `the one to ${row.supplier?.name ?? "a supplier"}` : row.number)).join(", ")} ${moves.own.length === 1 ? "is" : "are"} yours, so skipped` : undefined,
              actions: (
                <>
                  {moves.approve.length && data.can.approve ? (
                    <Button icon="check" onClick={() => onMove("approve", moves.approve)}>
                      Approve {moves.approve.length}
                    </Button>
                  ) : null}
                  {moves.pay.length && data.can.pay ? (
                    <Button icon="payments" onClick={() => onMove("pay", moves.pay)}>
                      Pay {moves.pay.length}
                    </Button>
                  ) : null}
                  {moves.send.length && data.can.draft ? (
                    <Button icon="send" onClick={() => onMove("submit", moves.send)}>
                      Send for approval
                    </Button>
                  ) : null}
                  <MenuButton label="More" items={more(selected)}>
                    More
                  </MenuButton>
                </>
              ),
            }}
          />
        }
      >
        {data.rows.length === 0 ? (
          <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
            <b>{filtered ? "No payment matches" : query.view === "to-approve" ? "Nothing waits for approval" : "No payments yet"}</b>
            <p className="muted">{filtered ? "Clear the search or the filters to see the rest." : "Pay a supplier's bills with Pay suppliers."}</p>
          </div>
        ) : (
          <table className="table" aria-label="Payments made">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 220 }} />
              <col />
              <col style={{ width: 130 }} />
              <col style={{ width: 160 }} />
            </colgroup>
            <thead>
              <tr>
                <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                <th>Payment</th>
                <th>Date</th>
                <th>Paid to</th>
                <th>For</th>
                <th>State</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                  <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
                  <td>
                    <span className={row.number === "Draft" || row.number === "—" ? "muted" : "ref"}>{row.number}</span>
                  </td>
                  <td className="muted">{row.date}</td>
                  <td className="truncate">
                    <span className="cell-lead">{row.supplier?.name ?? "—"}</span>
                  </td>
                  <td className="fill truncate">
                    {row.bill ? (
                      <Link className="ref" href={`/books/bills/${row.bill.id}`}>
                        {row.bill.number}
                      </Link>
                    ) : (
                      <span className="cell-lead">{row.forWhat}</span>
                    )}
                  </td>
                  <td>
                    <BkState tone={TONE[row.status]}>{row.state}</BkState>
                  </td>
                  <td className="num" style={row.voided ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined} title={row.voided?.reason ?? undefined}>
                    {money(row.amount, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}
