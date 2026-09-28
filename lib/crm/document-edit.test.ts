/**
 * When a quote or an invoice can still be edited, and what the rep is told
 * when it cannot.
 *
 * Every lock here protects something already booked against the document as
 * it stood: money received, a credit, a write-off, a receipt at ZIMRA, or the
 * client's own answer. Each refusal names what happened and what to do
 * instead, because the reason is drawn on the greyed-out "Edit" and has to be
 * a next step, not a dead end.
 */
import { describe, expect, it } from "vitest";

import { invoiceEditLock, quoteEditLock, quoteReviseLock } from "@/lib/crm/document-edit";

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

  it("is allowed while the client's link waits for an answer, or never got one", () => {
    for (const approvalStatus of [null, "PENDING", "EXPIRED", "REVOKED"]) {
      expect(invoiceEditLock({ ...openInvoice, approvalStatus })).toBeNull();
    }
  });

  it("is refused once the client has answered, either way", () => {
    expect(invoiceEditLock({ ...openInvoice, approvalStatus: "APPROVED" })).toBe(
      "Approved by the client — adjust it with a credit note in Accounting",
    );
    expect(invoiceEditLock({ ...openInvoice, approvalStatus: "DECLINED" })).toBe(
      "Declined by the client — credit it in Accounting and raise a new one",
    );
  });

  it("names money received before the client's answer", () => {
    expect(invoiceEditLock({ ...openInvoice, amountPaid: 50, approvalStatus: "APPROVED" })).toBe(
      "Part paid — issue a credit note in Accounting",
    );
  });
});

describe("editing a quote in place", () => {
  it("is allowed while nobody has answered it", () => {
    for (const approvalStatus of [undefined, null, "PENDING", "EXPIRED", "REVOKED"]) {
      expect(quoteEditLock({ status: "SENT", approvalStatus })).toBeNull();
    }
    expect(quoteEditLock({ status: "DRAFT" })).toBeNull();
  });

  it("is refused once the client has answered", () => {
    // Approving marks the quotation ACCEPTED too; the answer alone is enough.
    expect(quoteEditLock({ status: "SENT", approvalStatus: "APPROVED" })).toBe(
      "Approved by the client — raise a new quote for any change",
    );
    // A decline leaves the quotation SENT: the next step is a revision.
    expect(quoteEditLock({ status: "SENT", approvalStatus: "DECLINED" })).toBe(
      "Declined by the client — revise it as a new version",
    );
  });

  it("is refused once accepted, void or expired", () => {
    expect(quoteEditLock({ status: "ACCEPTED", approvalStatus: "APPROVED" })).toBe(
      "Accepted — raise a new quote for any change",
    );
    expect(quoteEditLock({ status: "VOIDED" })).toBe("Voided — it has been replaced or withdrawn");
    expect(quoteEditLock({ status: "EXPIRED" })).toBe("Expired — raise a new quote");
  });
});

describe("revising a quote as its next version", () => {
  it("is allowed once the client has declined it", () => {
    expect(quoteReviseLock({ status: "SENT", approvalStatus: "DECLINED" })).toBeNull();
  });

  it("is refused while nobody has answered it — it is edited instead", () => {
    for (const approvalStatus of [null, "PENDING", "EXPIRED", "REVOKED"]) {
      expect(quoteReviseLock({ status: "SENT", approvalStatus })).toBe("Not declined — edit it instead");
    }
  });

  it("is refused once accepted, or once it has already been replaced", () => {
    expect(quoteReviseLock({ status: "ACCEPTED", approvalStatus: "APPROVED" })).toBe(
      "Accepted — raise a new quote for any change",
    );
    expect(quoteReviseLock({ status: "VOIDED", approvalStatus: "DECLINED" })).toBe(
      "Voided — it has been replaced or withdrawn",
    );
  });
});
