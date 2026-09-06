import type { BlockingReceiptWire } from "./types";

/**
 * FD-7.1 — turning a `FiscalReceipt` row into the thing a supervisor can find.
 *
 * This lives beside the console's types rather than in either route because a
 * Next.js route module may only export HTTP handlers: a helper exported from
 * `route.ts` fails the framework's own export check, and copying it into both
 * the fleet route and the `[id]` route is how the two views end up describing
 * the same receipt differently. It is pure — no Prisma, no client hooks — so
 * both sides can import it.
 */

/** The columns both routes select. Kept as one shape so a field added for one
 *  view cannot go missing in the other. */
export type BlockingReceiptRow = {
  id: string;
  status: string;
  receiptNumber: string | null;
  fiscalNumber: string | null;
  receiptCounter: number | null;
  receiptGlobalNo: number | null;
  createdAt: Date;
  lastError: string | null;
  attemptCount: number;
  nextRetryAt: Date | null;
  invoiceId: string | null;
  schoolReceiptId: string | null;
  creditNoteId: string | null;
  retailSaleId: string | null;
  invoice: { invoiceNumber: string } | null;
  schoolReceipt: { receiptNo: string } | null;
  creditNote: { noteNumber: string } | null;
  retailSale: { saleNo: string } | null;
};

/**
 * Name the source document, not just the receipt row.
 *
 * A supervisor at 6pm is holding paper. "Fiscal receipt 9f3c-…" is unfindable;
 * "till sale RS-1043" is on the spike next to them. `FiscalReceipt`'s
 * one-source CHECK guarantees exactly one of the four columns is set, so
 * `unknown` means that constraint has stopped holding — surfaced rather than
 * hidden behind a dash, because a chain that will not verify is the alternative
 * way to find out.
 */
export function describeReceiptSource(row: BlockingReceiptRow): {
  sourceKind: BlockingReceiptWire["sourceKind"];
  sourceRef: string | null;
} {
  if (row.invoiceId) return { sourceKind: "invoice", sourceRef: row.invoice?.invoiceNumber ?? null };
  if (row.schoolReceiptId) {
    return { sourceKind: "school-receipt", sourceRef: row.schoolReceipt?.receiptNo ?? null };
  }
  if (row.creditNoteId) {
    return { sourceKind: "credit-note", sourceRef: row.creditNote?.noteNumber ?? null };
  }
  if (row.retailSaleId) return { sourceKind: "till-sale", sourceRef: row.retailSale?.saleNo ?? null };
  return { sourceKind: "unknown", sourceRef: null };
}

export function toBlockingReceiptWire(row: BlockingReceiptRow): BlockingReceiptWire {
  const { sourceKind, sourceRef } = describeReceiptSource(row);
  return {
    id: row.id,
    status: row.status,
    receiptNumber: row.receiptNumber,
    fiscalNumber: row.fiscalNumber,
    receiptCounter: row.receiptCounter,
    receiptGlobalNo: row.receiptGlobalNo,
    sourceKind,
    sourceRef,
    createdAt: row.createdAt.toISOString(),
    lastError: row.lastError,
    attemptCount: row.attemptCount,
    nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
  };
}

/** Human wording for `sourceKind`, used in both the table and the refusal
 *  banner so the two never disagree about what a row is. */
export const SOURCE_KIND_LABELS: Record<BlockingReceiptWire["sourceKind"], string> = {
  invoice: "Sales invoice",
  "school-receipt": "Fee receipt",
  "credit-note": "Credit note",
  "till-sale": "Till sale",
  unknown: "Unattributed receipt",
};
