/** The sums and words of Reverse and Delete, as the dialogs show them. */
import { describe, expect, it } from "vitest";

import { creditLines, deleteAsk, removalSentence, wasFiscalised, type InvoiceRemoval } from "./reversal";

const lines = [
  { id: "a", description: "Vinyl sheet", quantity: 10, unitPrice: 50, taxRate: 15, taxCodeId: "vat" },
  { id: "b", description: "Coved skirting", quantity: 4, unitPrice: 25, taxRate: 15, taxCodeId: "vat" },
];

describe("what a credit note credits", () => {
  it("credits chosen lines at their price and VAT, up to their quantity", () => {
    expect(creditLines("INV-0143", lines, { lines: [{ lineId: "b", quantity: 2 }, { lineId: "a", quantity: 0 }] })).toEqual({
      lines: [{ description: "Coved skirting", quantity: 2, unitPrice: 25, taxRate: 15, taxCodeId: "vat" }],
      total: 57.5,
    });
    expect(creditLines("INV-0143", lines, { lines: [{ lineId: "b", quantity: 5 }] })).toEqual({ error: "Coved skirting: at most 4 can be credited." });
    expect(creditLines("INV-0143", lines, { lines: [] })).toEqual({ error: "Choose a line to credit, and how much of it." });
  });

  it("credits an amount including VAT at the invoice's rate", () => {
    expect(creditLines("INV-0143", lines, { amount: 115 })).toEqual({
      lines: [{ description: "Credit against INV-0143", quantity: 1, unitPrice: 100, taxRate: 15, taxCodeId: "vat" }],
      total: 115,
    });
    expect(creditLines("INV-0143", [lines[0]!, { ...lines[1]!, taxRate: 0 }], { amount: 10 })).toEqual({
      error: "INV-0143's lines carry different VAT rates. Credit chosen lines instead.",
    });
  });
});

describe("what Delete takes with it", () => {
  const removal: InvoiceRemoval = { number: "INV-0143", draft: false, ledgerEntries: 3, paymentLinks: 1, creditNotes: 0, fiscalRecord: true, fiscalDayOpen: false, fiscalised: false, periodClosed: false, crm: false };

  it("names each thing that goes", () => {
    expect(removalSentence(removal)).toBe("INV-0143 and its 3 ledger entries, 1 payment link and the fiscal record");
    expect(removalSentence({ ...removal, paymentLinks: 0, fiscalRecord: false, ledgerEntries: 1 })).toBe("INV-0143 and its 1 ledger entry");
    expect(removalSentence({ ...removal, draft: true, ledgerEntries: 0, paymentLinks: 0, fiscalRecord: false })).toBe("INV-0143");
  });

  it("counts an invoice as fiscalised once it is signed or accepted", () => {
    expect(wasFiscalised(null)).toBe(false);
    expect(wasFiscalised({ status: "PENDING", receiptGlobalNo: null })).toBe(false);
    expect(wasFiscalised({ status: "PENDING", receiptGlobalNo: 12 })).toBe(true);
    expect(wasFiscalised({ status: "SUCCESS", receiptGlobalNo: null })).toBe(true);
  });

  it("asks for a reason and the number typed, warns of a closed month, and refuses an open fiscal day", () => {
    const ask = deleteAsk({ ...removal, periodClosed: true }, "Borrowdale Brooke Clinic");
    expect(ask.body).toBe(
      "This deletes INV-0143 and its 3 ledger entries, 1 payment link and the fiscal record, as if it was never written. Its payment stays as Borrowdale Brooke Clinic's money on account. Its month is closed: deleting it changes figures that were closed. It can't be undone; the audit log keeps a copy.",
    );
    expect(ask).toMatchObject({ go: "Delete the invoice", fill: "bad", typed: { text: "INV-0143" }, field: { key: "reason", min: 3 } });
    const draft = deleteAsk({ ...removal, draft: true }, "Borrowdale Brooke Clinic");
    expect(draft).toMatchObject({ go: "Delete the draft" });
    expect(draft.typed).toBeUndefined();
    expect(draft.field).toBeUndefined();
    expect(deleteAsk({ ...removal, fiscalDayOpen: true }, "Borrowdale Brooke Clinic")).toMatchObject({ go: "" });
  });

  it("never offers to delete a fiscalised invoice, and points to the credit note instead", () => {
    const ask = deleteAsk({ ...removal, fiscalised: true }, "Borrowdale Brooke Clinic");
    expect(ask).toMatchObject({ title: "INV-0143 can't be deleted", go: "" });
    expect(ask.body).toContain("Reverse it instead: a credit note");
  });
});
