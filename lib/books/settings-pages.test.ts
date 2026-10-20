import { describe, expect, it } from "vitest";

import { openingProblem } from "./core/opening-balances";
import { parseTrialBalanceCsv } from "./opening-csv";
import { formatNumber } from "./settings-pages";

describe("Settings", () => {
  it("writes a series' next number with its prefix", () => {
    expect(formatNumber("INV-", 145)).toBe("INV-0145");
    expect(formatNumber("INV-27", 1)).toBe("INV-27-0001");
  });

  it("takes opening balances that balance, each account one side", () => {
    expect(openingProblem([{ accountId: "a", debit: 100, credit: 0 }, { accountId: "b", debit: 0, credit: 100 }])).toBeNull();
    expect(openingProblem([{ accountId: "a", debit: 100, credit: 0 }])).toMatch(/two accounts/);
    expect(openingProblem([{ accountId: "a", debit: 100, credit: 0 }, { accountId: "b", debit: 0, credit: 90 }])).toMatch(/must be equal/);
  });

  it("brings in a trial balance by account code, leaving out codes the chart lacks", () => {
    const parsed = parseTrialBalanceCsv("Code,Account,Debit,Credit\n1010,CBZ,2140.60,\n3000,Capital,,2140.60\n9999,Nope,5,", [
      { id: "bank", code: "1010" },
      { id: "capital", code: "3000" },
    ]);
    expect(parsed.lines).toEqual([
      { accountId: "bank", debit: "2140.60", credit: "" },
      { accountId: "capital", debit: "", credit: "2140.60" },
    ]);
    expect(parsed.unknown).toEqual(["9999"]);
  });
});
