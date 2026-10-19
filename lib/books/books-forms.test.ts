import { describe, expect, it } from "vitest";

import { billFormErrors, billNote, billPayload } from "./bill-form";
import { creditNoteBody, creditNoteErrors } from "./credit-form";
import { dueDate, formTotals, invoiceFormErrors, invoicePayload, readNumber, type InvoiceForm } from "./invoice-form";
import { allocateOldestFirst, onAccount, paymentFormErrors, type OpenInvoice } from "./payment-form";
import { partyData, partyErrors, EMPTY_PARTY } from "./party-form";

const VAT = { id: "vat", label: "VAT 15.5%", rate: 15.5 };

const invoice = (patch: Partial<InvoiceForm> = {}): InvoiceForm => ({
  customerId: "c1",
  currency: "ZWG",
  invoiceDate: "2026-10-18",
  dueInDays: "14",
  costCenterId: "",
  notes: "",
  lines: [
    { description: "Vinyl plank, Polyflor Camaro oak", quantity: "82 m²", unitPrice: "540.00", taxCodeId: "vat" },
    { description: "Underlay, 2 mm acoustic", quantity: "82 m²", unitPrice: "67.50", taxCodeId: "vat" },
    { description: "Fitting", quantity: "82 m²", unitPrice: "162.00", taxCodeId: "vat" },
    { description: "Skirting, white, 100 mm", quantity: "64 m", unitPrice: "135.00", taxCodeId: "vat" },
  ],
  paidNow: false,
  paidInto: "",
  ...patch,
});

describe("New invoice (BkInvoiceNew)", () => {
  it("reads quantities with their units and works the board's sums out", () => {
    expect(readNumber("82 m²")).toBe(82);
    expect(readNumber("1,250.50")).toBe(1250.5);
    expect(formTotals(invoice().lines, [VAT])).toEqual({ net: 71739, tax: 11119.55, total: 82858.55, rates: [15.5] });
    expect(dueDate("2026-10-18", "14")).toBe("2026-11-01");
    expect(dueDate("2026-10-18", "")).toBeNull();
  });

  it("asks for the customer, a date and at least one line, and says what is wrong with a line", () => {
    expect(invoiceFormErrors(invoice(), "issue")).toEqual({});
    const errors = invoiceFormErrors(invoice({ customerId: "", lines: [{ description: "", quantity: "0", unitPrice: "x", taxCodeId: "" }] }), "issue");
    expect(errors.customerId).toBe("Choose who the invoice is to.");
    expect(errors["lines.0.description"]).toBeTruthy();
    expect(errors["lines.0.quantity"]).toBeTruthy();
    expect(errors["lines.0.unitPrice"]).toBeTruthy();
    expect(invoiceFormErrors(invoice({ lines: [{ description: "", quantity: "", unitPrice: "", taxCodeId: "" }] }), "draft").lines).toBe("Add at least one line.");
  });

  it("needs the account the money went into only when it is paid now and issued", () => {
    expect(invoiceFormErrors(invoice({ paidNow: true }), "issue").paidInto).toBeTruthy();
    expect(invoiceFormErrors(invoice({ paidNow: true }), "draft").paidInto).toBeUndefined();
  });

  it("sends the core what it issues: lines, due date, cost centre, quote, and paid-now only on issue", () => {
    const body = invoicePayload(invoice({ costCenterId: "cc", quotationId: "q1", paidNow: true, paidInto: "acc" }), "issue");
    expect(body).toMatchObject({ customerId: "c1", currency: "ZWG", dueDate: "2026-11-01", costCenterId: "cc", quotationId: "q1", issueNow: true, paidNow: { bankAccountId: "acc" } });
    expect(body.lines[0]).toEqual({ description: "Vinyl plank, Polyflor Camaro oak", quantity: 82, unitPrice: 540, taxCodeId: "vat" });
    const draft = invoicePayload(invoice({ paidNow: true, paidInto: "acc" }), "draft");
    expect(draft.issueNow).toBe(false);
    expect("paidNow" in draft).toBe(false);
  });
});

describe("Record a payment (BkPaymentNew)", () => {
  const open: OpenInvoice[] = [
    { id: "a", number: "INV-0135", due: "2026-10-13", daysLate: 5, balance: 860, currency: "USD" },
    { id: "b", number: "INV-0142", due: "2026-10-20", daysLate: 0, balance: 1494.22, currency: "USD" },
  ];

  it("puts the money on the oldest first and leaves the rest on account", () => {
    expect(allocateOldestFirst(1000, open)).toEqual([
      { invoiceId: "a", amount: 860 },
      { invoiceId: "b", amount: 140 },
    ]);
    expect(allocateOldestFirst(500, open)).toEqual([{ invoiceId: "a", amount: 500 }]);
    expect(onAccount(1000, [{ invoiceId: "a", amount: 860 }])).toBe(140);
  });

  it("always names the customer, and refuses more on an invoice than it owes", () => {
    const form = { customerId: "", bankAccountId: "acc", receivedAt: "2026-10-18", currency: "USD", amount: "1000", reference: "", allocations: [] };
    expect(paymentFormErrors(form, open).customerId).toMatch(/customer/);
    const over = paymentFormErrors({ ...form, customerId: "c1", allocations: [{ invoiceId: "a", amount: 900 }] }, open);
    expect(over["allocation.a"]).toBe("INV-0135 owes less than that.");
    const more = paymentFormErrors({ ...form, customerId: "c1", amount: "100", allocations: [{ invoiceId: "a", amount: 200 }] }, open);
    expect(more.allocations).toBe("More is put on invoices than was paid.");
    expect(paymentFormErrors({ ...form, customerId: "c1", allocations: [{ invoiceId: "a", amount: 860 }] }, open)).toEqual({});
  });
});

describe("Credit note and write-off from an invoice", () => {
  const target = { id: "i", number: "INV-0142", currency: "USD", creditLeft: 1994.22, balance: 1494.22, taxRate: 15.5 };

  it("asks for an amount within what is left, and a reason", () => {
    expect(creditNoteErrors("credit", target, "", "")).toMatchObject({ amount: expect.any(String), reason: expect.any(String) });
    expect(creditNoteErrors("credit", target, "2000", "Returned").amount).toMatch(/left to credit/);
    expect(creditNoteErrors("write-off", target, "1500", "Closed down").amount).toMatch(/still owed/);
    expect(creditNoteErrors("credit", target, "115.50", "Two boxes back")).toEqual({});
    expect(creditNoteErrors("credit", null, "1", "abc").invoice).toBeTruthy();
  });

  it("issues one line, its VAT worked back out of the amount at the invoice's rate", () => {
    const body = creditNoteBody(target, "115.50", "Two boxes back", new Date("2026-10-18T10:00:00Z"));
    expect(body).toMatchObject({ invoiceId: "i", noteDate: "2026-10-18", currency: "USD", issueNow: true, reason: "Two boxes back" });
    expect(body.lines).toEqual([{ description: "Credit on INV-0142: Two boxes back", quantity: 1, unitPrice: 100, taxRate: 15.5 }]);
  });
});

describe("Record a bill (BkBillNew) and the customer or supplier drawer", () => {
  it("checks the supplier, the date and the lines, and keeps their invoice number in the note", () => {
    const form = { vendorId: "", theirNumber: "00184977", billDate: "2026-10-17", fdmsCode: "91B4-0C7E", currency: "USD", dueInDays: "30", costCenterId: "", lines: [{ description: "Ceramic skirting", quantity: "60 m", unitPrice: "4.40", taxCodeId: "vat" }] };
    expect(billFormErrors(form).vendorId).toBeTruthy();
    expect(billFormErrors({ ...form, vendorId: "v" })).toEqual({});
    expect(billNote(form)).toBe("Their invoice 00184977. FDMS code 91B4-0C7E");
    expect(billPayload({ ...form, vendorId: "v" }, true)).toMatchObject({ vendorId: "v", receiveNow: true, dueDate: "2026-11-16", lines: [{ description: "Ceramic skirting", quantity: 60, unitPrice: 4.4, taxCodeId: "vat" }] });
  });

  it("needs a name, and an email only when one is given", () => {
    expect(partyErrors(EMPTY_PARTY).name).toBe("Give them a name.");
    expect(partyErrors({ ...EMPTY_PARTY, name: "Pomona Offices", email: "accounts@" }).email).toBeTruthy();
    expect(partyErrors({ ...EMPTY_PARTY, name: "Pomona Offices" })).toEqual({});
    expect(partyData({ name: " Pomona Offices ", email: "", vatNumber: "220087431" })).toMatchObject({ name: "Pomona Offices", email: null, vatNumber: "220087431", taxNumber: null });
  });
});
