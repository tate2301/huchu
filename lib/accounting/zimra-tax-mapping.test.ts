import { describe, expect, it } from "vitest";

import { planZimraTaxMapping } from "./zimra-tax-mapping";

const tax = (taxID: number, taxPercent: number | null, taxName: string) => ({
  taxID,
  taxPercent,
  taxName,
  validFrom: null,
  validTill: null,
});

const ZIMRA = [tax(1, 15, "Standard rated 15%"), tax(2, 0, "Zero rated"), tax(3, null, "Exempt")];

describe("planZimraTaxMapping", () => {
  it("maps a code to the one tax that charges its rate", () => {
    const plan = planZimraTaxMapping(
      [{ id: "vat", code: "VAT15", rate: 15, zimraTaxId: null }],
      ZIMRA,
    );
    expect(plan.mapped).toEqual([{ id: "vat", code: "VAT15", zimraTaxId: 1 }]);
  });

  it("will not put a 0% code on zero-rated when ZIMRA also lists exempt", () => {
    const plan = planZimraTaxMapping(
      [
        { id: "z", code: "VAT0", rate: 0, zimraTaxId: null },
        { id: "e", code: "EXEMPT", rate: 0, zimraTaxId: null },
      ],
      ZIMRA,
    );
    expect(plan.mapped).toEqual([]);
    expect(plan.ambiguous).toEqual(["VAT0", "EXEMPT"]);
  });

  it("maps zero-rated when ZIMRA lists no exempt tax", () => {
    const plan = planZimraTaxMapping(
      [{ id: "z", code: "ZERO", rate: 0, zimraTaxId: null }],
      [tax(1, 15.5, "Standard"), tax(2, 0, "Zero rated")],
    );
    expect(plan.mapped).toEqual([{ id: "z", code: "ZERO", zimraTaxId: 2 }]);
  });

  it("refuses to guess between two taxes at one rate", () => {
    const plan = planZimraTaxMapping(
      [{ id: "z", code: "ZERO", rate: 0, zimraTaxId: null }],
      [...ZIMRA, tax(4, 0, "Exempt at nil")],
    );
    expect(plan.mapped).toEqual([]);
    expect(plan.ambiguous).toEqual(["ZERO"]);
  });

  it("reports a rate ZIMRA does not charge, and leaves a mapped code alone", () => {
    const plan = planZimraTaxMapping(
      [
        { id: "odd", code: "VAT14", rate: 14.5, zimraTaxId: null },
        { id: "done", code: "VAT15", rate: 15, zimraTaxId: 9 },
      ],
      ZIMRA,
    );
    expect(plan.unmatched).toEqual(["VAT14"]);
    expect(plan.mapped).toEqual([]);
  });
});
