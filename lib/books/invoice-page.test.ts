import { describe, expect, it } from "vitest";

import { changesSinceQuote, shapeInvoicePage, type InvoicePageFacts } from "./invoice-page";

const d = (iso: string) => new Date(iso);
const lines = [
  { id: "l1", description: "Vinyl sheet, 3 consulting rooms", quantity: 58.4, unitPrice: 62, taxRate: 15.5 },
  { id: "l2", description: "Coved skirting", quantity: 64, unitPrice: 9.5, taxRate: 15.5 },
];

/** INV-0143 as the PageVaneDraft board draws it: Vane's, from QT-0398, waiting for a person. */
function facts(over: Partial<InvoicePageFacts["row"]> = {}): InvoicePageFacts {
  return {
    row: {
      id: "inv",
      invoiceNumber: "INV-0143",
      status: "DRAFT",
      currency: "USD",
      invoiceDate: d("2026-10-14T00:00:00Z"),
      dueDate: d("2026-11-04T00:00:00Z"),
      subTotal: 4228.8,
      taxTotal: 655.46,
      total: 4884.26,
      madeByVane: true,
      createdById: null,
      createdAt: d("2026-10-14T07:12:00Z"),
      issuedAt: null,
      customer: { id: "c", name: "Borrowdale Brooke Clinic" },
      createdBy: null,
      issuedBy: null,
      lines,
      fromQuotation: { quotationNumber: "QT-0398", total: 4884.08, lines },
      ...over,
    },
    acceptedAt: d("2026-10-07T10:00:00Z"),
    deal: { dealNo: "DL-0396", wonAt: d("2026-10-07T10:00:00Z") },
    usualTermsDays: 21,
    cardId: "card",
    timeZone: "Africa/Harare",
    can: { issue: true, discard: true },
  };
}

describe("an invoice in Books", () => {
  it("reads Vane's draft as the board does: made from the quote, dated on issue, due on their usual terms", () => {
    const page = shapeInvoicePage(facts());
    expect(page.vane).toEqual({ waiting: true, madeFrom: "Made from QT-0398, accepted on 7 October.", cardId: "card" });
    expect(page.finding).toEqual({
      fact: "$4,884.26 to Borrowdale Brooke Clinic, due 21 days after you issue it.",
      rest: "The accepted quote said $4,884.08; VAT worked out on each of its 2 lines adds 18 cents.",
    });
    expect(page.attrs).toEqual([
      { term: "Customer", value: "Borrowdale Brooke Clinic" },
      { term: "For", value: "DL-0396, won 7 Oct" },
      { term: "Date", value: "On issue" },
      { term: "Due", value: "21 days, their usual" },
      { term: "Status", value: "Draft", tone: "warn" },
      { term: "Made by", value: "Vane, 09:12" },
    ]);
    expect(page.taxLabel).toBe("VAT 15.5%");
    expect(page.changes).toEqual([]);
    expect(page.can).toEqual({ issue: true, discard: true });
  });

  it("once a person has issued it as theirs, says so and offers nothing to press", () => {
    const page = shapeInvoicePage(
      facts({ status: "ISSUED", createdById: "u", createdBy: { name: "James Banda" }, issuedBy: { name: "James Banda" }, issuedAt: d("2026-10-14T08:00:00Z") }),
    );
    expect(page.vane?.waiting).toBe(false);
    expect(page.attrs.find((attr) => attr.term === "Made by")?.value).toBe("Vane, taken on by James Banda");
    expect(page.finding.fact).toBe("$4,884.26 to Borrowdale Brooke Clinic, due on 4 November.");
    expect(page.can).toEqual({ issue: false, discard: false });
  });

  it("lists each line changed, dropped or added since the quote", () => {
    const quote = [
      { description: "Fitting", quantity: 58.4, unitPrice: 18.17 },
      { description: "Underlay", quantity: 2, unitPrice: 46.5 },
      { description: "Skirting", quantity: 64, unitPrice: 9.5 },
    ];
    const invoice = [
      { description: "Fitting", quantity: 60, unitPrice: 18.17 },
      { description: "Underlay", quantity: 2, unitPrice: 49.8 },
      { description: "Threshold strip", quantity: 1, unitPrice: 12 },
    ];
    expect(changesSinceQuote(quote, invoice, "USD")).toEqual([
      { term: "Fitting", value: "58.4 on the quote, 60 here" },
      { term: "Underlay", value: "$46.50 on the quote, $49.80 here" },
      { term: "Skirting", value: "On the quote, not here" },
      { term: "Threshold strip", value: "Added since the quote" },
    ]);
  });
});
