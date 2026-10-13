import { describe, expect, it } from "vitest";

import { lineKey, parseStatementAmount, parseStatementDate, readStatement } from "./statement";

describe("readStatement", () => {
  it("reads money in and money out from two columns", () => {
    const csv = [
      "CBZ Bank,Account 01234",
      "Date,Description,Reference,Debit,Credit,Balance",
      "02/10/2026,EcoCash merchant settlement 0412,,,\"1,412.50\",\"8,000.00\"",
      "05/10/2026,Halsted Builders supplies,CHQ 77,312.40,,\"7,687.60\"",
      "06/10/2026,Closing balance,,,,\"7,669.60\"",
    ].join("\r\n");
    const read = readStatement(csv);
    expect(read).toEqual({
      ok: true,
      skipped: 1,
      rows: [
        { date: "2026-10-02", description: "EcoCash merchant settlement 0412", reference: null, amount: 1412.5, direction: "CREDIT" },
        { date: "2026-10-05", description: "Halsted Builders supplies", reference: "CHQ 77", amount: 312.4, direction: "DEBIT" },
      ],
    });
  });

  it("reads one signed amount column", () => {
    const read = readStatement("Transaction date,Narration,Amount\n2026-10-06,Service fee October,-18.00\n2026-10-05,Transfer inv142,500");
    expect(read.ok && read.rows.map((row) => [row.direction, row.amount])).toEqual([
      ["DEBIT", 18],
      ["CREDIT", 500],
    ]);
  });

  it("says what is missing when the file is not a statement", () => {
    expect(readStatement("Name,Phone\nRudo,0772")).toEqual({ ok: false, error: expect.stringContaining("Date column") });
    expect(readStatement("Date,Amount\n2026-10-01,5")).toEqual({ ok: false, error: "The file has no Description column." });
  });
});

describe("parsing", () => {
  it("reads dates day first, and refuses days that do not exist", () => {
    expect(parseStatementDate("02/10/2026")).toBe("2026-10-02");
    expect(parseStatementDate("2 Oct 2026")).toBe("2026-10-02");
    expect(parseStatementDate("02-Oct-26")).toBe("2026-10-02");
    expect(parseStatementDate("31/09/2026")).toBeNull();
  });

  it("reads amounts in the shapes banks print them", () => {
    expect(parseStatementAmount("(312.40)")).toBe(-312.4);
    expect(parseStatementAmount("312.40 DR")).toBe(-312.4);
    expect(parseStatementAmount("$1,412.50")).toBe(1412.5);
    expect(parseStatementAmount("")).toBeNull();
    expect(parseStatementAmount("n/a")).toBeNull();
  });

  it("keys a line so the same upload twice adds nothing", () => {
    const row = { date: "2026-10-05", amount: 500, direction: "CREDIT" as const, description: " Transfer inv142 " };
    expect(lineKey(row)).toBe(lineKey({ ...row, description: "transfer INV142" }));
  });
});
