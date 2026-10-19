import { describe, expect, it } from "vitest";

import { movedTo, receivablesMovedTo, salesMovedTo } from "./moved";

describe("an old Books address", () => {
  it("forwards to the new one with its query", () => {
    expect(movedTo("/books/journals", { journal: "j1", tab: "drafts" })).toBe("/books/journals?journal=j1&tab=drafts");
    expect(movedTo("/books/vat", {})).toBe("/books/vat");
    expect(movedTo("/books/periods", { a: ["1", "2"], b: undefined })).toBe("/books/periods?a=1&a=2");
  });
});

describe("/accounting/sales (books-final §3.4)", () => {
  it("lands on Invoices, keeping the rest of the query", () => {
    expect(salesMovedTo({})).toBe("/books/invoices");
    expect(salesMovedTo({ customer: "c1" })).toBe("/books/invoices?customer=c1");
    expect(salesMovedTo({ view: "invoices", q: "INV-0142" })).toBe("/books/invoices?q=INV-0142");
  });

  it("maps each ?view= to its tab or page", () => {
    expect(salesMovedTo({ view: "customers" })).toBe("/books/customers");
    expect(salesMovedTo({ view: "receipts" })).toBe("/books/payments");
    expect(salesMovedTo({ view: "credit-notes" })).toBe("/books/credit-notes");
    expect(salesMovedTo({ view: "write-offs" })).toBe("/books/credit-notes?view=write-offs");
    expect(salesMovedTo({ view: "ar-aging" })).toBe("/books/customers?view=by-age");
    expect(salesMovedTo({ view: "aging" })).toBe("/books/customers?view=by-age");
    expect(salesMovedTo({ view: "statements", customers: "a,b" })).toBe("/books/statements?customers=a%2Cb");
    expect(salesMovedTo({ view: "something-else" })).toBe("/books/invoices");
  });

  it("maps each ?action=new-* to its Books form or drawer, never back to /accounting", () => {
    expect(salesMovedTo({ action: "new-invoice" })).toBe("/books/invoices/new");
    expect(salesMovedTo({ action: "new-receipt", view: "receipts" })).toBe("/books/payments/new");
    expect(salesMovedTo({ action: "new-customer" })).toBe("/books/customers?action=new-customer");
    expect(salesMovedTo({ action: "new-credit-note" })).toBe("/books/credit-notes?action=new-credit-note");
    expect(salesMovedTo({ action: "new-write-off" })).toBe("/books/credit-notes?action=new-write-off");
    for (const action of ["new-invoice", "new-receipt", "new-customer", "new-credit-note", "new-write-off"]) {
      expect(salesMovedTo({ action })).not.toMatch(/accounting/);
    }
  });
});

describe("/accounting/receivables", () => {
  it("lands on Customers by age, keeping the query", () => {
    expect(receivablesMovedTo({})).toBe("/books/customers?view=by-age");
    expect(receivablesMovedTo({ q: "Pomona", view: "x" })).toBe("/books/customers?view=by-age&q=Pomona");
  });
});
