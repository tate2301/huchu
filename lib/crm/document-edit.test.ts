/**
 * When a quote or an invoice can still be edited, and what the rep is told
 * when it cannot.
 *
 * Every lock here protects something already booked against the document as
 * it stood: money received, a credit, a write-off, a receipt at ZIMRA. Each
 * refusal names what happened and what to do instead, because the reason is
 * drawn on the greyed-out "Edit" and has to be a next step, not a dead end.
 */
import { describe, expect, it } from "vitest";

import { invoiceEditLock, quoteEditLock } from "@/lib/crm/document-edit";

const openInvoice = {
  status: "ISSUED",
  amountPaid: 0,
  creditTotal: 0,
  writeOffTotal: 0,
  receiptCount: 0,
  creditNoteCount: 0,
  writeOffCount: 0,
  fiscalised: false,
};

describe("editing an invoice", () => {
  it("is allowed while it is issued and nothing has touched it", () => {
    expect(invoiceEditLock(openInvoice)).toBeNull();
  });

  it("is refused once it is paid", () => {
    expect(invoiceEditLock({ ...openInvoice, status: "PAID", amountPaid: 500 })).toBe(
      "Paid — issue a credit note in Accounting",
    );
  });

  it("is refused once any money has come in", () => {
    expect(invoiceEditLock({ ...openInvoice, amountPaid: 50 })).toBe(
      "Part paid — issue a credit note in Accounting",
    );
  });

  it("is refused when a receipt exists even though the cached balance has not caught up", () => {
    // `amountPaid` is recalculated after the receipt's transaction; the
    // receipt itself is the fact.
    expect(invoiceEditLock({ ...openInvoice, receiptCount: 1 })).toBe(
      "Part paid — issue a credit note in Accounting",
    );
  });

  it("is refused once it has been credited, draft credit notes included", () => {
    expect(invoiceEditLock({ ...openInvoice, creditTotal: 20 })).toBe(
      "Credited — adjust it with a credit note in Accounting",
    );
    expect(invoiceEditLock({ ...openInvoice, creditNoteCount: 1 })).toBe(
      "Credited — adjust it with a credit note in Accounting",
    );
  });

  it("is refused once part of it has been written off", () => {
    expect(invoiceEditLock({ ...openInvoice, writeOffTotal: 10 })).toBe(
      "Written off — adjust it in Accounting",
    );
    expect(invoiceEditLock({ ...openInvoice, writeOffCount: 1 })).toBe(
      "Written off — adjust it in Accounting",
    );
  });

  it("is refused once it has been sent to the fiscal device", () => {
    expect(invoiceEditLock({ ...openInvoice, fiscalised: true })).toBe(
      "Sent to ZIMRA — issue a credit note in Accounting",
    );
  });

  it("is refused once it is void", () => {
    expect(invoiceEditLock({ ...openInvoice, status: "VOIDED" })).toBe(
      "Voided — raise a new invoice instead",
    );
  });

  it("is refused while it is still a draft in Accounting", () => {
    expect(invoiceEditLock({ ...openInvoice, status: "DRAFT" })).toBe(
      "Not issued — finish it in Accounting",
    );
  });

  it("names the paid state before the fiscal one — the stronger fact first", () => {
    expect(
      invoiceEditLock({ ...openInvoice, status: "PAID", amountPaid: 500, fiscalised: true }),
    ).toBe("Paid — issue a credit note in Accounting");
  });
});

describe("editing a quote", () => {
  it("is allowed while it is out with the client, and after they decline", () => {
    // A decline leaves the quotation SENT; revising it is the natural answer.
    expect(quoteEditLock({ status: "SENT" })).toBeNull();
    expect(quoteEditLock({ status: "DRAFT" })).toBeNull();
  });

  it("is refused once accepted, void or expired", () => {
    expect(quoteEditLock({ status: "ACCEPTED" })).toBe("Accepted — raise a new quote for any change");
    expect(quoteEditLock({ status: "VOIDED" })).toBe("Voided — it has been replaced or withdrawn");
    expect(quoteEditLock({ status: "EXPIRED" })).toBe("Expired — raise a new quote");
  });
});
