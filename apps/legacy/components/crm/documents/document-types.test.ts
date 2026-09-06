import { describe, expect, it } from "vitest";

import {
  documentNumber,
  documentStatus,
  invoiceOutstanding,
  type LeadDocument,
} from "./document-types";

function doc(overrides: Partial<LeadDocument> = {}): LeadDocument {
  return {
    id: "doc-1",
    type: "QUOTATION",
    quotationId: null,
    invoiceId: null,
    receiptId: null,
    amount: 100,
    currency: "USD",
    version: 1,
    supersedesId: null,
    revisionNote: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    approval: null,
    quotation: null,
    invoice: null,
    receipt: null,
    ...overrides,
  };
}

function invoice(overrides: Partial<NonNullable<LeadDocument["invoice"]>> = {}) {
  return {
    id: "inv-1",
    invoiceNumber: "INV-0001",
    status: "ISSUED",
    dueDate: null,
    total: 1000,
    amountPaid: 0,
    creditTotal: 0,
    writeOffTotal: 0,
    ...overrides,
  };
}

describe("invoiceOutstanding", () => {
  it("subtracts payments, credits and write-offs", () => {
    expect(
      invoiceOutstanding(invoice({ total: 1000, amountPaid: 400, creditTotal: 100, writeOffTotal: 50 })),
    ).toBe(450);
  });

  it("never reports a negative balance on an overpaid invoice", () => {
    expect(invoiceOutstanding(invoice({ total: 100, amountPaid: 150 }))).toBe(0);
  });

  it("rounds to cents rather than leaking float noise", () => {
    expect(invoiceOutstanding(invoice({ total: 0.3, amountPaid: 0.1 }))).toBe(0.2);
  });
});

describe("documentStatus", () => {
  it("prefers the client's approval over the stored quotation status", () => {
    const status = documentStatus(
      doc({
        quotation: { id: "q", quotationNumber: "QTN-0001", status: "SENT", validUntil: null, total: 100 },
        approval: { token: "t", status: "APPROVED", respondedAt: "2026-01-02T00:00:00.000Z" },
      }),
    );
    expect(status).toEqual({ label: "Accepted", status: "passing" });
  });

  it("shows a pending approval as awaiting the client", () => {
    const status = documentStatus(
      doc({
        quotation: { id: "q", quotationNumber: "QTN-0001", status: "SENT", validUntil: null, total: 100 },
        approval: { token: "t", status: "PENDING", respondedAt: null },
      }),
    );
    expect(status.label).toBe("Awaiting client");
  });

  it("reports a declined quotation as failing", () => {
    const status = documentStatus(
      doc({ approval: { token: "t", status: "DECLINED", respondedAt: null } }),
    );
    expect(status).toEqual({ label: "Declined", status: "failing" });
  });

  it("distinguishes a part-paid invoice from an unpaid one", () => {
    expect(
      documentStatus(doc({ type: "INVOICE", invoice: invoice({ amountPaid: 400 }) })).label,
    ).toBe("Part paid");
    expect(documentStatus(doc({ type: "INVOICE", invoice: invoice() })).label).toBe("Issued");
  });

  it("flags an invoice past its due date as overdue", () => {
    const status = documentStatus(
      doc({ type: "INVOICE", invoice: invoice({ dueDate: "2020-01-01T00:00:00.000Z" }) }),
    );
    expect(status).toEqual({ label: "Overdue", status: "failing" });
  });

  it("does not call a paid invoice overdue, however late the payment was", () => {
    const status = documentStatus(
      doc({
        type: "INVOICE",
        invoice: invoice({ status: "PAID", amountPaid: 1000, dueDate: "2020-01-01T00:00:00.000Z" }),
      }),
    );
    expect(status).toEqual({ label: "Paid", status: "passing" });
  });
});

describe("documentNumber", () => {
  it("reads the number off whichever record backs the document", () => {
    expect(
      documentNumber(
        doc({ type: "RECEIPT", receipt: { id: "r", receiptNumber: "REC-0007", receivedAt: "", amount: 10, method: "Cash" } }),
      ),
    ).toBe("REC-0007");
  });

  it("falls back to a dash rather than rendering undefined", () => {
    expect(documentNumber(doc())).toBe("—");
  });
});
