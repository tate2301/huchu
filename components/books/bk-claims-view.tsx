"use client";

import * as React from "react";

import { Button, Icon, TableFoot, TableShell, Person } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { CLAIM_TAB_LABEL, CLAIM_VIEWS, type ClaimQuery, type ClaimRow, type ClaimsPage, type FloatRow, type VoucherRow } from "@/lib/books/claims-list";
import { money } from "@/lib/books/format";

import { BkState, BkTabs } from "./bk-list";
import { Cents } from "./figures";

const CLAIM_TONE = { DRAFT: "plain", SUBMITTED: "warning", APPROVED: "info", REJECTED: "void", PAID: "success", VOIDED: "void" } as const;
const VOUCHER_TONE = { DRAFT: "plain", TO_APPROVE: "warning", POSTED: "success", VOIDED: "void" } as const;

export type ClaimMoves = {
  approveClaim: (row: ClaimRow) => void;
  payBack: (row: ClaimRow, accountId: string) => void;
  approveVoucher: (row: VoucherRow) => void;
  topUp: (row: FloatRow, accountId: string) => void;
};

/**
 * Books → Bills & spending → Claims & petty cash (design/core-modules/boards/view/BkClaims.html):
 * the tabs Claims, Floats and Vouchers, each one table or one band per float,
 * with its one next step on the row (Approve, Pay back from an account, Top up
 * a float). Approving is never the claimant's own; the server refuses on its own.
 */
export function BkClaimsView({ data, onQuery, moves }: { data: ClaimsPage; onQuery: (next: Partial<ClaimQuery>) => void; moves: ClaimMoves }) {
  const query = data.query;
  const { from, to, of } = data.range;
  const payFrom = (currency: string) => data.accounts.filter((account) => !account.isFloat && account.currency === currency);
  const spent = data.vouchers.filter((row) => row.kind === "SPEND" && row.status !== "VOIDED");

  const empty = (title: string) => (
    <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
      <b>{title}</b>
    </div>
  );

  return (
    <div className="bk">
      <BkTabs label="Claim views" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={CLAIM_VIEWS.map((view) => ({ value: view, label: CLAIM_TAB_LABEL[view], count: data.counts[view] }))} />
      {query.view === "floats" ? (
        data.floats.length === 0 ? (
          empty("No floats yet")
        ) : (
          <div className="bk-floats">
            {data.floats.map((row) => (
              <section key={row.id}>
                <div className="bk-fl-h">
                  <h2>{row.name}</h2>
                  {row.imprest > 0.005 ? (
                    <span className="muted">
                      imprest <Cents value={row.imprest} currency={row.currency} />
                    </span>
                  ) : null}
                </div>
                <div className="bk-fl-b">
                  <div className="bk-fl-holds">
                    <span className="muted">Holds</span>
                    <Cents value={row.left} currency={row.currency} />
                  </div>
                  {row.imprest > 0.005 ? (
                    <div className="bk-fl-track" aria-hidden="true">
                      <i style={{ width: `${Math.max(0, Math.min(100, (row.left / row.imprest) * 100))}%` }} />
                    </div>
                  ) : null}
                  <div className="bk-fl-m">
                    <span className="bk-fl-who">{row.holder ? <Person name={row.holder} src={row.holderImage} /> : <span className="muted">Nobody holds it</span>}</span>
                    <span className="muted">
                      {row.vouchers} {row.vouchers === 1 ? "voucher" : "vouchers"} since the last top-up
                    </span>
                  </div>
                  {data.can.topUp && row.spent > 0.005 ? (
                    <MenuButton
                      label="Top up from"
                      items={
                        payFrom(row.currency).length
                          ? payFrom(row.currency).map((account) => ({ key: account.id, label: account.name, onSelect: () => moves.topUp(row, account.id) }))
                          : [{ key: "none", label: `No ${row.currency} account to top up from`, disabled: true, onSelect: () => undefined }]
                      }
                    >
                      Top up <Cents value={row.spent} currency={row.currency} />
                    </MenuButton>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <TableShell
          label={CLAIM_TAB_LABEL[query.view]}
          foot={
            query.view === "claims" && (of > data.claims.length || query.page > 1) ? (
              <TableFoot
                range={`${from} to ${to} of ${of}`}
                page={{ onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined, onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined }}
              />
            ) : query.view === "vouchers" && data.vouchers.length > 0 ? (
              <TableFoot
                range={`${of} ${of === 1 ? "voucher" : "vouchers"}`}
                sums={[{ label: "Spent", value: money(spent.reduce((sum, row) => sum + row.amount, 0), data.currency) }]}
                page={
                  of > data.vouchers.length || query.page > 1
                    ? {
                        onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
                        onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
                      }
                    : undefined
                }
              />
            ) : undefined
          }
        >
          {query.view === "claims" ? (
            data.claims.length === 0 ? (
              empty("No claims yet")
            ) : (
              <table className="table" aria-label="Claims">
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col style={{ width: 200 }} />
                  <col />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Claim</th>
                    <th>Person</th>
                    <th>For</th>
                    <th>State</th>
                    <th className="num">Amount, {data.currency}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.claims.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span className={row.number === "Draft" ? "muted" : "ref"}>{row.number}</span>
                      </td>
                      <td className="truncate">
                        <span className="cell-lead">
                          <Person name={row.person.name} src={row.person.image} />
                        </span>
                      </td>
                      <td className="fill truncate">
                        <span className="cell-lead">{row.forWhat}</span>
                      </td>
                      <td>
                        <BkState tone={CLAIM_TONE[row.status]}>{row.state}</BkState>
                      </td>
                      <td className="num">
                        <Cents value={row.amount} currency={row.currency} />
                      </td>
                      <td>
                        {row.status === "SUBMITTED" && data.can.approve && row.person.id !== data.me ? (
                          <Button size="sm" icon="check" onClick={() => moves.approveClaim(row)}>
                            Approve
                          </Button>
                        ) : row.status === "APPROVED" && data.can.pay && row.person.id !== data.me ? (
                          <MenuButton
                            size="sm"
                            icon="payments"
                            label="Pay back from"
                            items={
                              payFrom(row.currency).length
                                ? payFrom(row.currency).map((account) => ({ key: account.id, label: account.name, onSelect: () => moves.payBack(row, account.id) }))
                                : [{ key: "none", label: `No ${row.currency} account to pay from`, disabled: true, onSelect: () => undefined }]
                            }
                          >
                            Pay back
                          </MenuButton>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : data.vouchers.length === 0 ? (
            empty("No vouchers yet")
          ) : (
            <table className="table" aria-label="Vouchers">
              <colgroup>
                <col style={{ width: 110 }} />
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Voucher</th>
                  <th>For</th>
                  <th>Date</th>
                  <th>Slip</th>
                  <th>State</th>
                  <th className="num">Amount, {data.currency}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.vouchers.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className={row.number === "Draft" ? "muted" : "ref"}>{row.number}</span>
                    </td>
                    <td className="fill truncate">
                      <span className="cell-lead">{row.forWhat}</span> <span className="muted">{row.float}</span>
                    </td>
                    <td className="muted">{row.date}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {row.slip ? (
                        <span className="muted">
                          <Icon name="camera" /> Photo
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <BkState tone={VOUCHER_TONE[row.status]}>{row.kind === "TOP_UP" ? "Top-up" : row.state}</BkState>
                    </td>
                    <td className="num">
                      <Cents value={row.amount} currency={row.currency} />
                    </td>
                    <td>
                      {row.status === "TO_APPROVE" && data.can.approve && row.createdById !== data.me ? (
                        <Button size="sm" icon="check" onClick={() => moves.approveVoucher(row)}>
                          Approve
                        </Button>
                      ) : null}
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
