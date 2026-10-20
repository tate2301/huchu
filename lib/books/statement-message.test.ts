import { describe, expect, it } from "vitest";

import { statementMessage, whatsappLink, whatsappNumber } from "./statement-message";

describe("a statement sent by WhatsApp (BkCustomer)", () => {
  const page = {
    name: "Pomona Offices",
    currency: "USD",
    statement: {
      from: "2026-08-01",
      to: "2026-10-18",
      closing: 1494.22,
      lines: [
        { date: "6 Oct", document: "INV-0142", invoiced: 1994.22, paid: null },
        { date: "8 Oct", document: "REC-0091", invoiced: null, paid: 500 },
      ],
    },
  };

  it("lists each document and says what is owed", () => {
    expect(statementMessage(page)).toBe(
      ["Statement for Pomona Offices, 1 August to 18 October 2026.", "6 Oct: INV-0142, US$1,994.22", "8 Oct: REC-0091, US$500.00 paid", "You owe US$1,494.22."].join("\n"),
    );
  });

  it("says when nothing is owed, or what is on account", () => {
    expect(statementMessage({ ...page, statement: { ...page.statement, closing: 0 } })).toMatch(/Nothing is owed\.$/);
    expect(statementMessage({ ...page, statement: { ...page.statement, closing: -40 } })).toMatch(/US\$40\.00 is on your account\.$/);
  });

  it("reads Zimbabwe's numbers the way WhatsApp does", () => {
    expect(whatsappNumber("077 412 0981")).toBe("263774120981");
    expect(whatsappNumber("+263 77 412 0981")).toBe("263774120981");
    expect(whatsappNumber("00263774120981")).toBe("263774120981");
    expect(whatsappNumber("")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappLink("263774120981", "Hi & bye")).toBe("https://wa.me/263774120981?text=Hi%20%26%20bye");
  });
});
