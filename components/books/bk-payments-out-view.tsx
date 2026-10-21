"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { count, money } from "@/lib/books/format";
import { PERIOD_LABEL, PERIODS } from "@/lib/books/period";
import { PAYMENT_OUT_TAB_LABEL, PAYMENT_OUT_VIEWS, type PaymentOutQuery, type PaymentOutRow, type PaymentsOutPage } from "@/lib/books/payments-out";

import { BkChip, BkQuietTools, BkState, BkTabs, BkTools, useBkLayout } from "./bk-list";
import { Cents } from "./figures";

const TONE = { DRAFT: "plain", TO_APPROVE: "warning", APPROVED: "info", PAID: "success", VOIDED: "void" } as const;

/** One line, cut with an ellipsis, as in Credit notes. */
const ellipsis: React.CSSProperties = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
/** The totals row: on the fill, sticking to the bottom of the scroll, as the design draws it. */
const footCell: React.CSSProperties = { position: "sticky", bottom: 0, zIndex: 1, height: 40, background: "var(--color-fill)", color: "var(--color-ink)", fontWeight: 600, whiteSpace: "nowrap" };

/** What a selection can do next, and the rows each move takes. */
export function paymentMoves(rows: PaymentOutRow[], me: string) {
  return {
    approve: rows.filter((row) => row.status === "TO_APPROVE" && row.createdById !== me),
    pay: rows.filter((row) => row.status === "APPROVED"),
    send: rows.filter((row) => row.status === "DRAFT"),
    own: rows.filter((row) => row.status === "TO_APPROVE" && row.createdById === me),
  };
}

const unnumbered = (row: PaymentOutRow) => row.number === "Draft" || row.number === "—";

/**
 * Books → Bills & spending → Payments made (design/books/html/bk-payments-made.html):
 * the tabs, the search with Supplier and Account, ten columns on one line each,
 * and the totals. A selection is approved, paid or sent for approval as each
 * row allows (D5); the server refuses on its own.
 */
export function BkPaymentsOutView({
  data,
  onQuery,
  exportHref,
  onMove,
  onExport,
  more,
}: {
  data: PaymentsOutPage;
  onQuery: (next: Partial<PaymentOutQuery>) => void;
  exportHref: string;
  onMove: (move: "approve" | "pay" | "submit", rows: PaymentOutRow[]) => void;
  onExport: (rows: PaymentOutRow[]) => void;
  more: (rows: PaymentOutRow[]) => MenuEntry[];
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const source = React.useMemo(() => data.rows, [data?.rows]);
  const layout = useBkLayout(
    "payments-made",
    [
      { key: "to", label: "To", nth: 3 },
      { key: "state", label: "State", nth: 4 },
      { key: "date", label: "Date", nth: 5 },
      { key: "from", label: "From", nth: 6 },
      { key: "withheld", label: "Withheld", nth: 8 },
      { key: "note", label: "Note", nth: 10 },
    ],
    [
      { key: "supplier", label: "Supplier", by: (row) => row.supplier?.name ?? "No supplier" },
      { key: "state", label: "State", by: (row) => row.state },
      { key: "account", label: "Account", by: (row) => row.from ?? "No account" },
    ],
    source,
  );
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const live = selected.filter((row) => row.status !== "VOIDED");
  const moves = paymentMoves(selected, data.me);
  const supplier = data.suppliers.find((option) => option.id === query.supplier);
  const account = data.accounts.find((option) => option.id === query.account);
  const { from, to, of } = data.range;
  const filtered = Boolean(query.q || query.supplier || query.account || query.period !== "any");
  const counted = data.rows.filter((row) => row.status !== "VOIDED");
  const sum = (pick: (row: PaymentOutRow) => number) => counted.reduce((total, row) => total + pick(row), 0);

  return (
    <div className="bk">
      <BkTabs label="Payment views" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={PAYMENT_OUT_VIEWS.map((view) => ({ value: view, label: PAYMENT_OUT_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search payments"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={of.toLocaleString("en-GB")}
        chips={
          <>
            <BkChip
              label="Supplier"
              value={supplier?.name ?? "Any"}
              set={Boolean(supplier)}
              items={[
                { key: "any", label: "Any supplier", checked: !query.supplier, onSelect: () => onQuery({ supplier: null, page: 1 }) },
                { separator: true },
                ...data.suppliers.map((option) => ({ key: option.id, label: option.name, checked: query.supplier === option.id, onSelect: () => onQuery({ supplier: option.id, page: 1 }) })),
              ]}
            />
            <BkChip
              label="Account"
              value={account?.name ?? "Any"}
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
        end={<BkQuietTools middle={layout.tools} onSort={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })} sortLabel={query.sort === "newest" ? "Sort" : "Oldest first"} exportHref={exportHref} />}
      />
      <div className={layout.wrap} style={{ display: "contents" }}>
        {layout.style}
        <TableShell
          label="Payments made"
          foot={
            <TableFoot
              range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
              page={{
                onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
                onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
              }}
              selection={{
                count: selected.length,
                sum: { label: "Paying", value: money(live.reduce((total, row) => total + row.paid, 0), data.currency) },
                onClear: selection.clear,
                note: moves.own.length ? `${moves.own.map((row) => (unnumbered(row) ? `the one to ${row.supplier?.name ?? "a supplier"}` : row.number)).join(", ")} ${moves.own.length === 1 ? "is" : "are"} yours, so skipped` : undefined,
                actions: (
                  <>
                    {moves.approve.length && data.can.approve ? (
                      <Button icon="check" shortcut="A" onClick={() => onMove("approve", moves.approve)}>
                        Approve
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
                    <Button icon="export" onClick={() => onExport(selected)}>
                      Export
                    </Button>
                    {more(selected).length ? (
                      <MenuButton label="More" items={more(selected)}>
                        More
                      </MenuButton>
                    ) : null}
                  </>
                ),
              }}
            />
          }
        >
          {data.rows.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>{filtered ? "No payment matches" : query.view === "to-approve" ? "Nothing waits for approval" : "No payments yet"}</b>
            </div>
          ) : (
            <table className="table" aria-label="Payments made">
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 112 }} />
                <col />
                <col style={{ width: 112 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 160 }} />
              </colgroup>
              <thead>
                <tr>
                  <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every payment" />
                  <th>Number</th>
                  <th>To</th>
                  <th>State</th>
                  <th>Date</th>
                  <th>From</th>
                  <th className="num">Gross</th>
                  <th className="num">Withheld</th>
                  <th className="num">Paid, {data.currency}</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {layout.rows((row) => {
                  const struck = row.voided ? ({ textDecoration: "line-through", color: "var(--color-muted)" } as const) : undefined;
                  return (
                    <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                      <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${unnumbered(row) ? "the payment" : row.number}`} />
                      <td>
                        <Link className={unnumbered(row) ? "muted" : "ref"} href={`/books/payments-made/${row.id}`}>
                          {unnumbered(row) ? "No number" : row.number}
                        </Link>
                      </td>
                      <td>
                        <span className="cell-lead" style={ellipsis}>
                          {row.supplier?.name ?? "—"}
                        </span>
                      </td>
                      <td>
                        <BkState tone={TONE[row.status]}>{row.state}</BkState>
                      </td>
                      <td className="muted">{row.date}</td>
                      <td>
                        <span style={ellipsis}>{row.from ?? "—"}</span>
                      </td>
                      <td className="num" style={struck}>
                        <Cents value={row.amount} currency={row.currency} />
                      </td>
                      <td className="num" style={struck}>
                        {row.withheld > 0.004 ? <Cents value={row.withheld} currency={row.currency} /> : <span className="muted">—</span>}
                      </td>
                      <td className="num" style={struck}>
                        <Cents value={row.paid} currency={row.currency} />
                      </td>
                      <td title={row.note?.text} style={row.note?.warn ? { color: "var(--color-warning)" } : { color: "var(--color-muted)" }}>
                        <span style={ellipsis}>{row.note?.text ?? ""}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={footCell} />
                  <td style={footCell}>{count(of, "payment")}</td>
                  <td style={footCell} />
                  <td style={footCell} />
                  <td style={footCell} />
                  <td style={footCell} />
                  <td style={footCell} className="num">
                    <Cents value={sum((row) => row.amount)} currency={data.currency} />
                  </td>
                  <td style={footCell} className="num">
                    <Cents value={sum((row) => row.withheld)} currency={data.currency} />
                  </td>
                  <td style={footCell} className="num">
                    <Cents value={sum((row) => row.paid)} currency={data.currency} />
                  </td>
                  <td style={footCell} />
                </tr>
              </tfoot>
            </table>
          )}
        </TableShell>
      </div>
    </div>
  );
}
