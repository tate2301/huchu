"use client";

import * as React from "react";

import { Button, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { CLAIM_STATE_FILTER_LABEL, CLAIM_STATE_FILTERS, CLAIM_TAB_LABEL, CLAIM_VIEWS, type ClaimQuery, type ClaimRow, type ClaimsPage, type FloatRow, type VoucherRow } from "@/lib/books/claims-list";
import { money } from "@/lib/books/format";
import { PERIOD_LABEL, PERIODS } from "@/lib/books/period";

import { BkChip, BkQuietTools, BkState, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const CLAIM_TONE = { DRAFT: "plain", SUBMITTED: "warning", APPROVED: "info", REJECTED: "void", PAID: "success", VOIDED: "void" } as const;
const VOUCHER_TONE = { DRAFT: "plain", TO_APPROVE: "warning", POSTED: "success", VOIDED: "void" } as const;

export type ClaimMoves = {
  approveClaim: (row: ClaimRow) => void;
  payBack: (row: ClaimRow, accountId: string) => void;
  approveVoucher: (row: VoucherRow) => void;
  topUp: (row: FloatRow, accountId: string) => void;
  approveClaims: (rows: ClaimRow[]) => void;
};

/**
 * Books → Bills & spending → Claims & petty cash (design/core-modules/boards/view/BkClaims.html):
 * what waits for approval and to be paid back; the tabs Claims, Floats and
 * Vouchers; each row's one next step on the row (Approve, Pay back from an
 * account, Top up a float). Approving is never the claimant's own; the server
 * refuses on its own.
 */
export function BkClaimsView({
  data,
  onQuery,
  exportHref,
  moves,
  undoEntries,
}: {
  data: ClaimsPage;
  onQuery: (next: Partial<ClaimQuery>) => void;
  exportHref: string;
  moves: ClaimMoves;
  /** Void and Delete permanently over the selected claims, as the person's role allows (P4, §5.13). */
  undoEntries?: (rows: ClaimRow[]) => MenuEntry[];
}) {
  const query = data.query;
  const ids = React.useMemo(() => data.claims.map((row) => row.id), [data.claims]);
  const selection = useSelection(ids);
  const selected = data.claims.filter((row) => selection.isSelected(row.id));
  const approvable = selected.filter((row) => row.status === "SUBMITTED" && row.person.id !== data.me);
  const own = selected.filter((row) => row.status === "SUBMITTED" && row.person.id === data.me);
  const person = data.people.find((option) => option.id === query.person);
  const { from, to, of } = data.range;
  const payFrom = (currency: string) => data.accounts.filter((account) => !account.isFloat && account.currency === currency);
  const filtered = Boolean(query.q || query.person || query.state || query.period !== "any");

  const tools = (
    <BkTools
      find={query.view === "vouchers" ? "Search vouchers" : query.view === "floats" ? "Search floats" : "Search claims"}
      query={query.q}
      onFind={(q) => onQuery({ q, page: 1 })}
      count={query.view === "claims" ? `${of} ${of === 1 ? "claim" : "claims"}` : query.view === "floats" ? `${of} ${of === 1 ? "float" : "floats"}` : `${of} ${of === 1 ? "voucher" : "vouchers"}`}
      chips={
        <>
          <BkChip
            label="Person"
            value={person?.name ?? "Anyone"}
            set={Boolean(person)}
            items={[
              { key: "any", label: "Anyone", checked: !query.person, onSelect: () => onQuery({ person: null, page: 1 }) },
              { separator: true },
              ...data.people.map((option) => ({ key: option.id, label: <Person name={option.name} src={option.image} />, checked: query.person === option.id, onSelect: () => onQuery({ person: option.id, page: 1 }) })),
            ]}
          />
          <BkChip
            label="State"
            value={query.state ? CLAIM_STATE_FILTER_LABEL[query.state] : "Any"}
            set={Boolean(query.state)}
            items={[
              { key: "any", label: "Any", checked: !query.state, onSelect: () => onQuery({ state: null, page: 1 }) },
              { separator: true },
              ...CLAIM_STATE_FILTERS.map((state) => ({ key: state, label: CLAIM_STATE_FILTER_LABEL[state], checked: query.state === state, onSelect: () => onQuery({ state, page: 1 }) })),
            ]}
          />
        </>
      }
      filters={PERIODS.map((period) => ({ key: period, label: PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
      end={<BkQuietTools onSort={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })} sortLabel={query.sort === "newest" ? "Sort" : "Oldest first"} exportHref={exportHref} />}
    />
  );

  const empty = (title: string, text: string) => (
    <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
      <b>{title}</b>
      <p className="muted">{text}</p>
    </div>
  );

  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs label="Claim views" value={query.view} onChange={(view) => onQuery({ view, page: 1, state: null, person: null })} items={CLAIM_VIEWS.map((view) => ({ value: view, label: CLAIM_TAB_LABEL[view], count: data.counts[view] }))} />
      {tools}
      <TableShell
        label={CLAIM_TAB_LABEL[query.view]}
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
            sums={[
              { label: "To approve", value: money(data.sums.toApprove, data.currency) },
              { label: "To pay back", value: money(data.sums.toPay, data.currency) },
              { label: `Paid in ${data.sums.monthName}`, value: money(data.sums.paidMonth, data.currency) },
            ]}
            page={
              query.view === "floats"
                ? undefined
                : {
                    onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
                    onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
                  }
            }
            selection={
              query.view === "claims"
                ? {
                    count: selected.length,
                    sum: { label: "Total", value: money(selected.reduce((sum, row) => sum + row.amount, 0), data.currency) },
                    onClear: selection.clear,
                    note: own.length ? `${own.map((row) => row.number).join(", ")} ${own.length === 1 ? "is" : "are"} yours, so skipped` : undefined,
                    actions: (
                      <>
                        {data.can.approve && approvable.length ? (
                          <Button icon="check" onClick={() => moves.approveClaims(approvable)}>
                            Approve {approvable.length}
                          </Button>
                        ) : null}
                        {undoEntries && undoEntries(selected).length ? (
                          <MenuButton label="More" items={undoEntries(selected)}>
                            More
                          </MenuButton>
                        ) : null}
                      </>
                    ),
                  }
                : undefined
            }
          />
        }
      >
        {query.view === "claims" ? (
          data.claims.length === 0 ? (
            empty(filtered ? "No claim matches" : "No claims yet", filtered ? "Clear the search or the filters to see the rest." : "Snap a slip with New claim: what you spent from your own pocket is paid back.")
          ) : (
            <table className="table" aria-label="Claims">
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 180 }} />
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                  <th>Claim</th>
                  <th>Person</th>
                  <th>For</th>
                  <th>State</th>
                  <th className="num">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.claims.map((row) => (
                  <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                    <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
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
                    <td className="num">{money(row.amount, row.currency)}</td>
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
        ) : query.view === "floats" ? (
          data.floats.length === 0 ? (
            empty("No floats yet", "A float is a cash account someone holds, topped up to its imprest. Set one up in Management, Money accounts.")
          ) : (
            <table className="table" aria-label="Floats">
              <colgroup>
                <col style={{ width: 220 }} />
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Float</th>
                  <th>Held by</th>
                  <th className="num">Imprest</th>
                  <th className="num">Spent since top-up</th>
                  <th className="num">Left</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.floats.map((row) => (
                  <tr key={row.id}>
                    <td className="truncate">
                      <span className="cell-lead">{row.name}</span>
                    </td>
                    <td className="truncate muted">{row.holder ? <Person name={row.holder} src={row.holderImage} /> : "Nobody yet"}</td>
                    <td className="num muted">{money(row.imprest, row.currency)}</td>
                    <td className="num">{money(row.spent, row.currency)}</td>
                    <td className="num">{money(row.left, row.currency)}</td>
                    <td>
                      {data.can.topUp && row.spent > 0.005 ? (
                        <MenuButton
                          size="sm"
                          icon="money"
                          label="Top up from"
                          items={
                            payFrom(row.currency).length
                              ? payFrom(row.currency).map((account) => ({ key: account.id, label: account.name, onSelect: () => moves.topUp(row, account.id) }))
                              : [{ key: "none", label: `No ${row.currency} account to top up from`, disabled: true, onSelect: () => undefined }]
                          }
                        >
                          Top up
                        </MenuButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : data.vouchers.length === 0 ? (
          empty("No vouchers yet", "Spent from a float? Write a voucher with New voucher.")
        ) : (
          <table className="table" aria-label="Vouchers">
            <colgroup>
              <col style={{ width: 120 }} />
              <col style={{ width: 200 }} />
              <col />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Float</th>
                <th>For</th>
                <th>State</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.vouchers.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className={row.number === "Draft" ? "muted" : "ref"}>{row.number}</span>
                  </td>
                  <td className="truncate muted">{row.float}</td>
                  <td className="fill truncate">
                    <span className="cell-lead">{row.forWhat}</span>
                  </td>
                  <td>
                    <BkState tone={VOUCHER_TONE[row.status]}>{row.kind === "TOP_UP" ? "Top-up" : row.state}</BkState>
                  </td>
                  <td className="num">{money(row.amount, row.currency)}</td>
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
    </div>
  );
}
