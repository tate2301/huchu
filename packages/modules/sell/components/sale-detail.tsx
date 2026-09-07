"use client";

import { Alert, StatCard } from "@corelithzw/react";

import { NumericCell } from "@corelithzw/ui/components/numeric-cell";

/**
 * One posted transaction, rendered the same in a dialog and on a page.
 *
 * R-4.3. `/retail/sales` opened a sale in a dialog and there was no URL for it.
 * That was fine until two things needed one:
 *
 *  - **R-3.3.** Every sale, refund and void now writes a `PlatformAuditEvent`
 *    carrying `entityType: "RetailSale"` and an `entityId`. An audit row that
 *    names a record nobody can open is a reference to nothing.
 *  - **A shopkeeper's Friday.** "Which one was RSL-0042?" is answered by pasting
 *    a link, not by describing which row to scroll to.
 *
 * So the body moved here and both surfaces render it. Extracting rather than
 * copying is the whole point: a receipt shown two ways that could disagree about
 * what was sold is worse than a receipt shown one way.
 */

export type RetailSaleDetail = {
  id: string;
  saleNo: string;
  saleType: string;
  status: string;
  cashierName: string | null;
  customerName: string | null;
  postedAt: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  tenderedAmount: number | null;
  changeAmount: number | null;
  promotionCode: string | null;
  overrideReason: string | null;
  voidReason: string | null;
  notes: string | null;
  payments: Array<{ id: string; tenderType: string; amount: number; reference: string | null }>;
  lines: Array<{
    id: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  sourceSale: { id: string; saleNo: string; saleType: string; totalAmount: number } | null;
  reversals: Array<{
    id: string;
    saleNo: string;
    saleType: string;
    status: string;
    totalAmount: number;
    postedAt: string | null;
  }>;
};

export function retailMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function retailTypeLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function RetailSaleDetailBody({
  sale,
  onOpenSale,
}: {
  sale: RetailSaleDetail;
  /**
   * How to reach another receipt — the sale this one reverses, or a reversal
   * against it.
   *
   * A callback rather than a `<Link>`, because the two surfaces reach it
   * differently: the page navigates, and the dialog swaps which sale it is
   * showing without closing. Hard-coding a link would make the dialog navigate
   * away from the list the user was reading.
   */
  onOpenSale?: (saleId: string) => void;
}) {
  const reason = sale.overrideReason || sale.voidReason || sale.notes;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Type" value={retailTypeLabel(sale.saleType)} />
        <StatCard label="Total" value={retailMoney(sale.totalAmount)} />
        <StatCard label="Promotion" value={sale.promotionCode ?? "None"} />
        <StatCard label="Source" value={sale.sourceSale?.saleNo ?? "None"} />
      </div>

      {reason ? (
        <Alert tone="warn" title="Recorded against this transaction">
          {sale.overrideReason ? <div>Override: {sale.overrideReason}</div> : null}
          {sale.voidReason ? <div>Void: {sale.voidReason}</div> : null}
          {sale.notes ? <div>Notes: {sale.notes}</div> : null}
        </Alert>
      ) : null}

      <section aria-labelledby="sale-lines">
        <h3 id="sale-lines" className="t-section t-strong">
          Lines
        </h3>
        <ul className="list-plain mt-2">
          {sale.lines.map((line) => (
            <li key={line.id} className="list-item">
              <span className="lead" aria-hidden="true" />
              <div>
                <div className="title bold">{line.itemName}</div>
                <div className="sub">
                  {line.quantity.toFixed(2)} × {retailMoney(line.unitPrice)}
                </div>
              </div>
              <NumericCell>{retailMoney(line.lineTotal)}</NumericCell>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sale-payments">
        <h3 id="sale-payments" className="t-section t-strong">
          Payments
        </h3>
        <ul className="list-plain mt-2">
          {sale.payments.map((payment) => (
            <li key={payment.id} className="list-item">
              <span className="lead" aria-hidden="true" />
              <div>
                <div className="title bold">{retailTypeLabel(payment.tenderType)}</div>
                <div className="sub">{payment.reference ?? "No reference"}</div>
              </div>
              <NumericCell>{retailMoney(payment.amount)}</NumericCell>
            </li>
          ))}
        </ul>
      </section>

      {/*
        A reversal is a new posted sale pointing back at this one, so both
        directions are worth showing: what this reverses, and what has reversed
        it. A receipt that has been refunded and does not say so is how a shop
        pays a refund twice.
      */}
      {sale.reversals.length > 0 ? (
        <section aria-labelledby="sale-reversals">
          <h3 id="sale-reversals" className="t-section t-strong">
            Reversals
          </h3>
          <ul className="list-plain mt-2">
            {sale.reversals.map((reversal) => (
              <li key={reversal.id} className="list-item">
                <span className="lead" aria-hidden="true" />
                <div>
                  <div className="title bold">
                    {onOpenSale ? (
                      <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={() => onOpenSale(reversal.id)}
                      >
                        {reversal.saleNo}
                      </button>
                    ) : (
                      reversal.saleNo
                    )}
                  </div>
                  <div className="sub">
                    {retailTypeLabel(reversal.saleType)} · {reversal.status}
                  </div>
                </div>
                <NumericCell>{retailMoney(reversal.totalAmount)}</NumericCell>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Subtotal" value={retailMoney(sale.subtotal)} />
        <StatCard label="Discount" value={retailMoney(sale.discountAmount)} />
        <StatCard label="Tax" value={retailMoney(sale.taxAmount)} />
        <StatCard
          label="Change"
          value={sale.changeAmount === null ? "—" : retailMoney(sale.changeAmount)}
        />
      </div>
    </div>
  );
}
