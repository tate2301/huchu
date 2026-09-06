import { describe, it, expect } from "vitest";
import {
  type BlockingReceiptRow,
  describeReceiptSource,
  SOURCE_KIND_LABELS,
  toBlockingReceiptWire,
} from "./receipt-mapping";

/**
 * FD-7.1 — the mapping both fiscal-day routes share.
 *
 * The thing worth testing here is not the field copying, it is the source
 * attribution. `FiscalReceipt` carries four nullable source columns and a CHECK
 * that exactly one is set; the console's entire usefulness at 6pm rests on
 * turning that column into a document number a supervisor is physically holding.
 * A row that names no source is the constraint having stopped holding, and the
 * mapper is the only place that can say so.
 */

const BASE: BlockingReceiptRow = {
  id: "receipt-1",
  status: "FAILED",
  receiptNumber: "0042",
  fiscalNumber: null,
  receiptCounter: 42,
  receiptGlobalNo: 812,
  createdAt: new Date("2026-08-19T14:05:00.000Z"),
  lastError: "connect ETIMEDOUT",
  attemptCount: 3,
  nextRetryAt: new Date("2026-08-19T14:35:00.000Z"),
  invoiceId: null,
  schoolReceiptId: null,
  creditNoteId: null,
  retailSaleId: null,
  invoice: null,
  schoolReceipt: null,
  creditNote: null,
  retailSale: null,
};

describe("describeReceiptSource", () => {
  it("names each of the four sources by its own document number", () => {
    expect(
      describeReceiptSource({
        ...BASE,
        invoiceId: "inv-1",
        invoice: { invoiceNumber: "INV-1043" },
      }),
    ).toEqual({ sourceKind: "invoice", sourceRef: "INV-1043" });

    expect(
      describeReceiptSource({
        ...BASE,
        schoolReceiptId: "sr-1",
        schoolReceipt: { receiptNo: "FR-0007" },
      }),
    ).toEqual({ sourceKind: "school-receipt", sourceRef: "FR-0007" });

    expect(
      describeReceiptSource({
        ...BASE,
        creditNoteId: "cn-1",
        creditNote: { noteNumber: "CN-0002" },
      }),
    ).toEqual({ sourceKind: "credit-note", sourceRef: "CN-0002" });

    expect(
      describeReceiptSource({
        ...BASE,
        retailSaleId: "rs-1",
        retailSale: { saleNo: "RS-1043" },
      }),
    ).toEqual({ sourceKind: "till-sale", sourceRef: "RS-1043" });
  });

  it("reports an unattributed receipt rather than hiding it behind a dash", () => {
    // Reachable only if FiscalReceipt's exactly-one-source CHECK has stopped
    // holding. The alternative way to discover that is a chain ZIMRA will not
    // verify, so the console says it out loud.
    expect(describeReceiptSource(BASE)).toEqual({ sourceKind: "unknown", sourceRef: null });
    expect(SOURCE_KIND_LABELS.unknown).toBe("Unattributed receipt");
  });

  it("keeps the kind when the joined document is missing", () => {
    // A select that did not include the relation, or a document deleted out
    // from under the receipt. The supervisor still learns which register to
    // look at even when the number cannot be resolved.
    expect(describeReceiptSource({ ...BASE, retailSaleId: "rs-1" })).toEqual({
      sourceKind: "till-sale",
      sourceRef: null,
    });
  });

  it("has a label for every kind it can produce", () => {
    const kinds = ["invoice", "school-receipt", "credit-note", "till-sale", "unknown"] as const;
    for (const kind of kinds) {
      expect(SOURCE_KIND_LABELS[kind], `${kind} has no label`).toBeTruthy();
    }
  });
});

describe("toBlockingReceiptWire", () => {
  it("serialises dates as ISO strings and preserves the diagnosis fields", () => {
    const wire = toBlockingReceiptWire({
      ...BASE,
      retailSaleId: "rs-1",
      retailSale: { saleNo: "RS-1043" },
    });

    expect(wire).toEqual({
      id: "receipt-1",
      status: "FAILED",
      receiptNumber: "0042",
      fiscalNumber: null,
      receiptCounter: 42,
      receiptGlobalNo: 812,
      sourceKind: "till-sale",
      sourceRef: "RS-1043",
      createdAt: "2026-08-19T14:05:00.000Z",
      lastError: "connect ETIMEDOUT",
      attemptCount: 3,
      nextRetryAt: "2026-08-19T14:35:00.000Z",
    });
  });

  it("passes a null next retry through rather than inventing a time", () => {
    // A receipt the drainer will not pick up again is a different operational
    // situation from one due in five minutes, and the console draws that
    // distinction — so an absent time must stay absent.
    const wire = toBlockingReceiptWire({ ...BASE, nextRetryAt: null });
    expect(wire.nextRetryAt).toBeNull();
  });
});
