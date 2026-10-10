import { describe, expect, it } from "vitest";

import {
  receiptAmount,
  receiptContent,
  receiptDoc,
  receiptLineLabel,
  receiptText,
  receiptTextLines,
  receiptTextProblem,
  sendByOf,
  type ReceiptContent,
  type ReceiptWire,
} from "./receipt-words";

const wire: ReceiptWire = {
  header: "HARARE BOTTLE STORE\n14 Samora Machel Ave",
  footer: "Bring the bottles back for your deposit.\nNot for sale to persons under 18.",
  showVatNumber: true,
  showLicenceNumber: true,
  printLogo: false,
  copies: 1,
  alsoSendBy: "WHATSAPP",
  vatNumber: "10023881",
  licenceNumber: "HRE/BL/2024/0711",
  logoUrl: "https://example.test/logo.png",
  liquor: true,
  currency: "US$",
};

const sale: ReceiptContent = {
  lines: [
    { label: "Castle 340ml x6", amount: "7.20" },
    { label: "Deposit x6", amount: "0.60" },
    { label: "Ice 2kg", amount: "1.50" },
  ],
  total: "9.30",
  currency: "US$",
  tenders: [{ label: "EcoCash", amount: "9.30" }],
  fiscal: "FDMS 0441-2209 · Day 214",
};

describe("the top and the bottom of a receipt", () => {
  it("keeps four lines of 42 characters", () => {
    expect(receiptTextProblem("HARARE BOTTLE STORE\n14 Samora Machel Ave")).toBeNull();
    expect(receiptTextProblem("")).toBeNull();
    expect(receiptTextProblem("a\nb\nc\nd\ne")).toBe("Keep it to 4 lines. The till prints each line as typed.");
    expect(receiptTextProblem(`ok\n${"x".repeat(43)}`)).toBe("Line 2 has 43 characters. A till receipt fits 42 on a line.");
    expect(receiptTextProblem("x".repeat(42))).toBeNull();
  });

  it("drops blank lines at the ends and trailing spaces, and keeps the ones between", () => {
    expect(receiptTextLines("\n  \nTop  \n\nBottom\n\n")).toEqual(["Top", "", "Bottom"]);
    expect(receiptTextLines(null)).toEqual([]);
  });
});

describe("a receipt laid out", () => {
  it("prints the board's receipt from the settings and the sale", () => {
    const doc = receiptDoc(wire, sale);
    expect(doc.head).toEqual(["HARARE BOTTLE STORE", "14 Samora Machel Ave"]);
    expect(doc.numbers).toEqual(["VAT 10023881", "Licence HRE/BL/2024/0711"]);
    expect(doc.total).toEqual({ label: "TOTAL US$", amount: "9.30" });
    expect(doc.foot).toEqual(["Bring the bottles back for your deposit.", "Not for sale to persons under 18."]);
    expect(doc.fiscal).toBe("FDMS 0441-2209 · Day 214");
    expect(doc.logoUrl).toBeNull();
  });

  it("leaves the VAT number off when turned off or not registered, and the licence off a general shop", () => {
    expect(receiptDoc({ ...wire, showVatNumber: false }, sale).numbers).toEqual(["Licence HRE/BL/2024/0711"]);
    expect(receiptDoc({ ...wire, vatNumber: null }, sale).numbers).toEqual(["Licence HRE/BL/2024/0711"]);
    expect(receiptDoc({ ...wire, liquor: false }, sale).numbers).toEqual(["VAT 10023881"]);
    expect(receiptDoc({ ...wire, showLicenceNumber: false }, sale).numbers).toEqual(["VAT 10023881"]);
  });

  it("prints the logo only when asked and there is one", () => {
    expect(receiptDoc({ ...wire, printLogo: true }, sale).logoUrl).toBe("https://example.test/logo.png");
    expect(receiptDoc({ ...wire, printLogo: true, logoUrl: null }, sale).logoUrl).toBeNull();
  });

  it("writes a plain-text copy for WhatsApp and email, fixed width", () => {
    const text = receiptText(receiptDoc(wire, sale));
    const lines = text.split("\n");
    expect(lines[0]).toBe("      HARARE BOTTLE STORE");
    expect(lines).toContain("Castle 340ml x6             7.20");
    expect(lines).toContain("TOTAL US$                   9.30");
    expect(lines[lines.length - 1]!.trim()).toBe("FDMS 0441-2209 · Day 214");
    expect(lines.every((line) => line.length <= 32)).toBe(true);
  });
});

describe("a sale as a receipt says it", () => {
  it("lists each line and its deposit, the payments, then the change in dollars and in ZiG notes", () => {
    // A basket rung offline, as the till builds it: no fiscal line until it reaches the server.
    expect(
      receiptContent({
        lines: [
          { name: "Castle Lager 340ml", quantity: 6, amount: 7.2, deposit: 0.6 },
          { name: "Ice 2kg bag", quantity: 1, amount: 1.5, deposit: 0 },
        ],
        total: 9.3,
        currency: "US$",
        payments: [{ tenderType: "CASH", currency: undefined, amount: 15 }],
        change: { usd: 5, zig: 19 },
        fiscal: null,
      }),
    ).toEqual({
      lines: [
        { label: "Castle Lager 340ml x6", amount: "7.20" },
        { label: "Deposit x6", amount: "0.60" },
        { label: "Ice 2kg bag", amount: "1.50" },
      ],
      total: "9.30",
      currency: "US$",
      tenders: [
        { label: "Cash US$", amount: "15.00" },
        { label: "Change US$", amount: "5.00" },
        { label: "Change ZiG", amount: "19.00" },
      ],
      fiscal: null,
    });
  });

  it("prints no change line when nothing was handed back, and ZiG cash by its own name", () => {
    const content = receiptContent({
      lines: [{ name: "Schweppes Tonic 200ml", quantity: 1, amount: 0.6, deposit: 0 }],
      total: 0.6,
      currency: "US$",
      payments: [{ tenderType: "CASH", currency: "ZWG", amount: 16.08 }],
      change: { usd: 0, zig: 0 },
      fiscal: null,
    });
    expect(content.tenders).toEqual([{ label: "Cash ZiG", amount: "16.08" }]);
  });
});

describe("words", () => {
  it("writes amounts and lines as a receipt does", () => {
    expect(receiptAmount(1234.5)).toBe("1,234.50");
    expect(receiptAmount("0.6")).toBe("0.60");
    expect(receiptLineLabel("Ice 2kg bag", 1)).toBe("Ice 2kg bag");
    expect(receiptLineLabel("Castle Lager 340ml", 6)).toBe("Castle Lager 340ml x6");
    expect(receiptLineLabel("Mince", 0.75)).toBe("Mince x0.75");
  });

  it("reads Also send by from the page's words", () => {
    expect(sendByOf("WhatsApp")).toBe("WHATSAPP");
    expect(sendByOf("Nothing")).toBe("NOTHING");
    expect(sendByOf("Fax")).toBeNull();
  });
});
