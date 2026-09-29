"use client";

import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  FactList,
  SectionHeading,
  type FactListItem,
} from "@/components/management/ui";
import {
  fiscalStatusLabel,
  formatQuantity,
  formatRetailDateTime,
  formatSignedMoney,
  saleTypeLabel,
  tenderLabel,
} from "@/lib/retail/words";

/**
 * One sale, at its own address — `/retail/sales/{id}`.
 *
 * The sales list used to open a sale in a read-only dialog as well, and this
 * body was shared between the two so the receipt could not be drawn two ways.
 * The dialog is gone: the record page is the detail, and a row in the list
 * opens it. Every sale, refund and void writes a `PlatformAuditEvent` naming
 * `RetailSale` and an id, so the page is also where an audit row leads.
 *
 * The page draws the record header — the sale number, and a badge only for a
 * refund, a void or a voided sale; this is the body under it: section headings
 * over fact rows, the lines and payments as column lists.
 */

export type RetailSaleDetail = {
  id: string;
  saleNo: string;
  saleType: string;
  status: string;
  cashierName: string | null;
  customerName: string | null;
  postedAt: string | null;
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
  shift: { id: string; shiftNo: string; registerName: string } | null;
  site: { id: string; name: string; code: string } | null;
  payments: Array<{ id: string; tenderType: string; amount: number; reference: string | null }>;
  lines: Array<{
    id: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  sourceSale: { id: string; saleNo: string; saleType: string; totalAmount: number } | null;
  /** Null when the shop has no fiscal device, or the sale never reached one. */
  fiscalReceipt: { status: string; fiscalNumber: string | null; lastError: string | null } | null;
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

/** Refund, Void, Voided — the one word a sale that is not a plain sale carries. */
export function saleExceptionLabel(sale: { saleType: string; status: string }): string | null {
  if (sale.saleType !== "SALE") return saleTypeLabel(sale.saleType);
  if (sale.status === "VOIDED") return "Voided";
  return null;
}

export const SALE_WIDTH = 560;

export function RetailSaleDetailBody({ sale }: { sale: RetailSaleDetail }) {
  const details: FactListItem[] = [
    {
      label: "Sold",
      value: formatRetailDateTime(sale.postedAt) || "Not posted",
      mono: Boolean(sale.postedAt),
    },
    { label: "Cashier", value: sale.cashierName ?? "Not on file", tone: sale.cashierName ? "default" : "muted" },
    { label: "Customer", value: sale.customerName ?? "Walk-in" },
    sale.shift
      ? { label: "Shift", value: sale.shift.shiftNo, mono: true, href: `/retail/shifts/${sale.shift.id}` }
      : { label: "Shift", value: "No shift", tone: "muted" },
    ...(sale.shift ? [{ label: "Till", value: sale.shift.registerName }] : []),
    { label: "Site", value: sale.site?.name ?? "No site", tone: sale.site ? "default" : "muted" },
    {
      label: "Promotion",
      value: sale.promotionCode ?? "None",
      mono: Boolean(sale.promotionCode),
      tone: sale.promotionCode ? "default" : "muted",
    },
    ...(sale.sourceSale
      ? [
          {
            label: `${saleTypeLabel(sale.saleType)} of`,
            value: sale.sourceSale.saleNo,
            mono: true,
            href: `/retail/sales/${sale.sourceSale.id}`,
          },
        ]
      : []),
    ...(sale.fiscalReceipt
      ? [
          {
            label: "ZIMRA",
            value:
              sale.fiscalReceipt.status === "SUCCESS" && sale.fiscalReceipt.fiscalNumber
                ? `${fiscalStatusLabel("SUCCESS")} · ${sale.fiscalReceipt.fiscalNumber}`
                : fiscalStatusLabel(sale.fiscalReceipt.status),
            mono: sale.fiscalReceipt.status === "SUCCESS",
            tone: sale.fiscalReceipt.status === "SUCCESS" ? ("default" as const) : ("warn" as const),
          },
        ]
      : []),
    ...(sale.overrideReason ? [{ label: "Override", value: sale.overrideReason }] : []),
    ...(sale.voidReason ? [{ label: "Void reason", value: sale.voidReason }] : []),
    ...(sale.notes ? [{ label: "Notes", value: sale.notes }] : []),
  ];

  const totals: FactListItem[] = [
    { label: "Subtotal", value: formatSignedMoney(sale.subtotal), mono: true },
    ...(sale.discountAmount
      ? [{ label: "Discount", value: formatSignedMoney(-Math.abs(sale.discountAmount)), mono: true }]
      : []),
    { label: "VAT", value: formatSignedMoney(sale.taxAmount), mono: true },
    { label: "Total", value: formatSignedMoney(sale.totalAmount), mono: true },
    ...(sale.tenderedAmount !== null
      ? [{ label: "Tendered", value: formatSignedMoney(sale.tenderedAmount), mono: true }]
      : []),
    ...(sale.changeAmount !== null
      ? [{ label: "Change", value: formatSignedMoney(sale.changeAmount), mono: true }]
      : []),
  ];

  return (
    <div>
      <SectionHeading maxWidth={SALE_WIDTH} className="mt-0">
        Details
      </SectionHeading>
      <FactList maxWidth={SALE_WIDTH} items={details} />

      <SectionHeading maxWidth={SALE_WIDTH} count={sale.lines.length}>
        Lines
      </SectionHeading>
      <ColumnList
        label="Lines"
        maxWidth={SALE_WIDTH}
        empty="No lines on this sale."
        columns={[
          { id: "product", label: "Product" },
          { id: "quantity", label: "Quantity", align: "end" },
          { id: "price", label: "Price", align: "end", hideBelow: "sm" },
          { id: "total", label: "Total", align: "end" },
        ]}
        rows={sale.lines.map((line) => ({
          id: line.id,
          cells: {
            product: <ColumnName name={line.itemName} />,
            quantity: <ColumnFigure>{formatQuantity(line.quantity)}</ColumnFigure>,
            price: <ColumnFigure>{formatSignedMoney(line.unitPrice)}</ColumnFigure>,
            total: <ColumnFigure>{formatSignedMoney(line.lineTotal)}</ColumnFigure>,
          },
        }))}
      />

      <SectionHeading maxWidth={SALE_WIDTH}>Total</SectionHeading>
      <FactList maxWidth={SALE_WIDTH} align="end" items={totals} />

      <SectionHeading maxWidth={SALE_WIDTH} count={sale.payments.length}>
        Payments
      </SectionHeading>
      <ColumnList
        label="Payments"
        maxWidth={SALE_WIDTH}
        empty="No payments on this sale."
        columns={[
          { id: "tender", label: "Tender" },
          { id: "amount", label: "Amount", align: "end" },
        ]}
        rows={sale.payments.map((payment) => ({
          id: payment.id,
          cells: {
            tender: <ColumnName name={tenderLabel(payment.tenderType)} meta={payment.reference} />,
            amount: <ColumnFigure>{formatSignedMoney(payment.amount)}</ColumnFigure>,
          },
        }))}
      />

      {/*
        A reversal is a new posted sale pointing back at this one. A sale that
        has been refunded and does not say so is how a shop pays a refund twice.
      */}
      {sale.reversals.length > 0 ? (
        <>
          <SectionHeading maxWidth={SALE_WIDTH} count={sale.reversals.length}>
            Refunds and voids
          </SectionHeading>
          <ColumnList
            label="Refunds and voids"
            maxWidth={SALE_WIDTH}
            columns={[
              { id: "sale", label: "Sale" },
              { id: "total", label: "Total", align: "end" },
            ]}
            rows={sale.reversals.map((reversal) => ({
              id: reversal.id,
              cells: {
                sale: (
                  <ColumnName
                    code={reversal.saleNo}
                    name={saleTypeLabel(reversal.saleType)}
                    meta={formatRetailDateTime(reversal.postedAt) || null}
                    href={`/retail/sales/${reversal.id}`}
                  />
                ),
                total: <ColumnFigure>{formatSignedMoney(reversal.totalAmount)}</ColumnFigure>,
              },
            }))}
          />
        </>
      ) : null}
    </div>
  );
}
