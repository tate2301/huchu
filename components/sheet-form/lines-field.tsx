"use client";

import * as React from "react";

import { Plus, X } from "@/lib/icons";
import { formatCount, formatMoney } from "@/lib/workspace/format";
import type { PickedOption, SheetCurrency, SheetLine } from "@/lib/workspace/sheet-kind";

import { LookupField } from "./lookup-field";
import { amountOf, lineTotals } from "./model";

/**
 * The `lines` field (00-foundations 5.7.4): products with a quantity and a
 * cost, the value recomputed as you type, an add row that is an `auto` over
 * the `product` noun (or `stock-line`, narrowed by `context`), and the Σ
 * totals. Sends `[{ productId, quantity, cost }]` through the kind's `submit`.
 * Cost and Value are not drawn for someone who may not see cost; a line the
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
}: LinesFieldProps) {
  const money = (n: number) => formatMoney(n, currency === "ZiG" ? "ZiG" : "USD");
  const totals = lineTotals(value);

  const add = (option: PickedOption | null) => {
    if (!option) return;
    if (value.some((line) => line.productId === option.id)) return;
    onValueChange([
      ...value,
      { productId: option.id, name: option.label, sub: option.sub ?? null, quantity: "1", cost: option.cost ?? "0.00", of: option.of ?? null },
    ]);
  };

  return (
    <div role="table" aria-label={label} className={showCost ? "sf-lines" : "sf-lines sf-lines--nocost"}>
      <div role="row" className="sf-lines__head">
        <span role="columnheader">Product</span>
        <span role="columnheader" className="sf-lines__num">{quantityLabel}</span>
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
            ) : line.sub ? (
              <span className={line.warn ? "sf-lines__sub sf-lines__sub--warn" : "sf-lines__sub"}>{line.sub}</span>
            ) : null}
          </span>
          <span role="cell" className="sf-lines__qty">
            <input
              aria-label={`${quantityLabel}, ${line.name}`}
              aria-invalid={lineErrors[index] ? true : undefined}
              inputMode="numeric"
              value={line.quantity}
              onChange={(event) =>
                onValueChange(
                  value.map((row) => (row.productId === line.productId ? { ...row, quantity: event.target.value } : row)),
                )
              }
            />
          </span>
          {showCost ? (
            <>
              <span role="cell" className="sf-lines__num sf-lines__cost">
                {money(amountOf(line.cost))}
              </span>
              <span role="cell" className="sf-lines__num">
                {money(amountOf(line.quantity) * amountOf(line.cost))}
              </span>
            </>
          ) : null}
          <span role="cell">
            <button
              type="button"
              className="sf-lines__remove"
              aria-label={`Remove ${line.name}`}
              onClick={() => onValueChange(value.filter((row) => row.productId !== line.productId))}
            >
              <X aria-hidden="true" />
            </button>
          </span>
        </div>
      ))}
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
      <div role="row" className="sf-lines__totals">
        <span role="cell" className="sf-lines__count">
          Σ <span className="cx-mono">{formatCount(totals.count)}</span> {totals.count === 1 ? "line" : "lines"}
        </span>
        <span role="cell" className="sf-lines__num">{formatCount(totals.quantity)}</span>
        {showCost ? (
          <>
            <span />
            <span role="cell" className="sf-lines__num">{money(totals.value)}</span>
          </>
        ) : null}
        <span />
      </div>
    </div>
  );
}
