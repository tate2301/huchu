"use client";

import * as React from "react";

import { Plus, X } from "@/lib/icons";
import { formatCount, formatMoney } from "@/lib/workspace/format";
import type { PickedOption, SheetCurrency, SheetLine } from "@/lib/workspace/sheet-kind";

import { LookupField } from "./lookup-field";
import { amountOf, lineTotals, orderFinancials } from "./model";

/**
 * The `lines` field (00-foundations 5.7.4): products with a quantity and a
 * cost, the value recomputed as you type, an add row that is an `auto` over
 * the `product` noun (or `stock-line`, narrowed by `context`), and the Σ
 * totals. Sends `[{ productId, quantity, cost }]` through the kind's `submit`.
 * Cost and Value are not drawn for someone who may not see cost, and read "—"
 * on a line whose cost is not known (blank), which the Σ value leaves out; a line the
 * server refused shows its message in place of its sub.
 */
export type LinesFieldProps = {
  id: string;
  label: string;
  value: SheetLine[];
  onValueChange: (value: SheetLine[]) => void;
  noun: string;
  currency: SheetCurrency;
  quantityLabel?: string;
  costLabel?: string;
  placeholder?: string;
  context?: Record<string, unknown>;
  showCost?: boolean;
  lineErrors?: Record<number, string>;
  onOpenChange?: (open: boolean) => void;
  /** Only the lines given: no add row and no remove. */
  closed?: boolean;
  /** With `closed`: × still drops a line. */
  droppable?: boolean;
  /** A line's sub in `--warn` while this holds, as typed. */
  lineWarn?: (line: SheetLine) => boolean;
  /** No quantity column: any of the products count (a buy-more deal). */
  hideQuantity?: boolean;
  /** Allow editing the buying price (cost) per line directly. */
  editableCost?: boolean;
  /** Show full-order financial totals (buying cost, retail revenue, profit, margin, markup). */
  showFinancials?: boolean;
};

export function LinesField({
  id,
  label,
  value,
  onValueChange,
  noun,
  currency,
  quantityLabel = "Quantity",
  costLabel = "Cost",
  placeholder = "Add a product: search, scan, or add a new one",
  context,
  showCost = true,
  lineErrors = {},
  onOpenChange,
  closed = false,
  droppable = false,
  lineWarn,
  hideQuantity = false,
  editableCost = false,
  showFinancials = false,
}: LinesFieldProps) {
  const money = (n: number) => formatMoney(n, currency === "ZiG" ? "ZiG" : "USD");
  const totals = lineTotals(value);
  const financials = orderFinancials(value);
  const displayFinancials = (showFinancials || editableCost || value.some((l) => Boolean(l.price))) && value.length > 0;

  const add = (option: PickedOption | null) => {
    if (!option) return;
    if (value.some((line) => line.productId === option.id)) return;
    onValueChange([
      ...value,
      {
        productId: option.id,
        name: option.label,
        sub: option.sub ?? null,
        quantity: "1",
        cost: option.cost ?? "0.00",
        price: option.price ?? null,
        supplierId: option.supplierId ?? null,
        supplierName: option.supplier ?? null,
        of: option.of ?? null,
      },
    ]);
  };

  return (
    <div
      role="table"
      aria-label={label}
      className={[
        "sf-lines",
        showCost ? "" : "sf-lines--nocost",
        hideQuantity ? "sf-lines--noqty" : "",
        editableCost ? "sf-lines--editcost" : "",
      ].filter(Boolean).join(" ")}
    >
      <div role="row" className="sf-lines__head">
        <span role="columnheader">Product</span>
        {hideQuantity ? null : <span role="columnheader" className="sf-lines__num">{quantityLabel}</span>}
        {showCost ? (
          <>
            <span role="columnheader" className="sf-lines__num">{costLabel}</span>
            <span role="columnheader" className="sf-lines__num">Value</span>
          </>
        ) : null}
        <span />
      </div>
      {value.map((line, index) => (
        <div role="row" key={line.productId} className="sf-lines__row">
          <span role="cell" className="sf-lines__name">
            <span className="sf-lines__title">{line.name}</span>
            {lineErrors[index] ? (
              <span className="sf-lines__sub sf-lines__sub--bad" role="alert">
                {lineErrors[index]}
              </span>
            ) : (
              <span className={line.warn || lineWarn?.(line) ? "sf-lines__sub sf-lines__sub--warn" : "sf-lines__sub"}>
                {line.supplierName ? (
                  <span className="sf-lines__badge" title={`Sourced from ${line.supplierName}`}>
                    {line.supplierName}
                  </span>
                ) : null}
                {line.sub ? `${line.sub} ` : ""}
                {line.price && showCost ? (
                  <span className="sf-lines__margin-tag">
                    · Sell: {money(amountOf(line.price))}
                    {amountOf(line.price) > 0 ? (
                      (() => {
                        const uCost = amountOf(line.cost);
                        const uPrice = amountOf(line.price);
                        const margin = (((uPrice - uCost) / uPrice) * 100).toFixed(0);
                        return ` (${margin}% margin)`;
                      })()
                    ) : null}
                  </span>
                ) : null}
              </span>
            )}
          </span>
          {hideQuantity ? null : (
            <span role="cell" className="sf-lines__qty">
              <input
                aria-label={`${quantityLabel}, ${line.name}`}
                aria-invalid={lineErrors[index] ? true : undefined}
                inputMode="numeric"
                value={line.quantity}
                onChange={(event) =>
                  onValueChange(
                    value.map((row) =>
                      row.productId === line.productId ? { ...row, quantity: event.target.value, touched: true } : row,
                    ),
                  )
                }
              />
            </span>
          )}
          {showCost ? (
            <>
              {editableCost ? (
                <span role="cell" className="sf-lines__cost-input">
                  <input
                    aria-label={`${costLabel}, ${line.name}`}
                    aria-invalid={lineErrors[index] ? true : undefined}
                    inputMode="decimal"
                    value={line.cost}
                    onChange={(event) =>
                      onValueChange(
                        value.map((row) =>
                          row.productId === line.productId ? { ...row, cost: event.target.value, touched: true } : row,
                        ),
                      )
                    }
                  />
                </span>
              ) : (
                <span role="cell" className="sf-lines__num sf-lines__cost">
                  {line.cost.trim() === "" ? "—" : money(amountOf(line.cost))}
                </span>
              )}
              <span role="cell" className="sf-lines__num">
                {line.cost.trim() === "" ? "—" : money(amountOf(line.quantity) * amountOf(line.cost))}
              </span>
            </>
          ) : null}
          <span role="cell">
            {closed && !droppable ? null : (
              <button
                type="button"
                className="sf-lines__remove"
                aria-label={`Remove ${line.name}`}
                disabled={Boolean(line.keep)}
                title={line.keep}
                onClick={() => onValueChange(value.filter((row) => row.productId !== line.productId))}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </span>
        </div>
      ))}
      {closed ? null : (
        <div className="sf-lines__add">
          <Plus aria-hidden="true" />
          <LookupField
            id={`${id}-add`}
            label={`Add to ${label}`}
            noun={noun}
            value={null}
            onValueChange={add}
            placeholder={placeholder}
            context={context}
            onOpenChange={onOpenChange}
          />
        </div>
      )}
      <div role="row" className={["sf-lines__totals", displayFinancials ? "sf-lines__totals--has-financials" : ""].filter(Boolean).join(" ")}>
        <span role="cell" className="sf-lines__count">
          Σ <span className="cx-mono">{formatCount(totals.count)}</span> {totals.count === 1 ? "line" : "lines"}
        </span>
        {hideQuantity ? null : <span role="cell" className="sf-lines__num">{formatCount(totals.quantity)}</span>}
        {showCost ? (
          <>
            <span />
            <span role="cell" className="sf-lines__num">{money(totals.value)}</span>
          </>
        ) : null}
        <span />
      </div>
      {displayFinancials ? (
        <div className="sf-lines__financials" aria-label="Order financial metrics">
          <div className="sf-lines__financial-metric">
            <span className="sf-lines__financial-label">Order Buying Cost</span>
            <span className="sf-lines__financial-val cx-mono">{money(financials.costValue)}</span>
          </div>
          <div className="sf-lines__financial-metric">
            <span className="sf-lines__financial-label">Projected Retail Revenue</span>
            <span className="sf-lines__financial-val cx-mono">
              {financials.retailValue > 0 ? money(financials.retailValue) : "—"}
            </span>
          </div>
          <div className="sf-lines__financial-metric">
            <span className="sf-lines__financial-label">Projected Gross Profit</span>
            <span
              className={[
                "sf-lines__financial-val cx-mono",
                financials.grossProfit >= 0 ? "sf-lines__financial-val--profit" : "sf-lines__financial-val--loss",
              ].join(" ")}
            >
              {financials.retailValue > 0 ? money(financials.grossProfit) : "—"}
            </span>
          </div>
          <div className="sf-lines__financial-metric">
            <span className="sf-lines__financial-label">Gross Margin</span>
            <span className="sf-lines__financial-val cx-mono">
              {financials.marginPercent !== null ? `${financials.marginPercent.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="sf-lines__financial-metric">
            <span className="sf-lines__financial-label">Markup</span>
            <span className="sf-lines__financial-val cx-mono">
              {financials.markupPercent !== null ? `${financials.markupPercent.toFixed(1)}%` : "—"}
            </span>
          </div>
          {financials.supplierCount > 1 ? (
            <div className="sf-lines__financial-metric sf-lines__financial-metric--span">
              <span className="sf-lines__financial-label">Multi-Supplier Order</span>
              <span className="sf-lines__financial-suppliers">
                Sourced from {financials.supplierCount} suppliers: {financials.suppliers.join(", ")}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
