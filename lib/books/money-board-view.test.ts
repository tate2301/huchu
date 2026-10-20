import { describe, expect, it } from "vitest";

import { afterComingUp, moneyAge, moneyBoardFinding, names, shortMonthSoFar } from "./money-board-view";

describe("Money's board", () => {
  it("says the month, then who owes whom, as bk-money writes it", () => {
    expect(moneyBoardFinding(10228.4, 2088.5, 5724.22, 2480, 6703.49, "USD")).toEqual({
      fact: "$10,228.40 came in this month and $2,088.50 went out.",
      rest: "$5,724.22 is owed to you, $2,480.00 of it late. You owe $6,703.49.",
    });
    expect(moneyBoardFinding(0, 0, 0, 0, 0, "USD")).toEqual({ fact: "Nothing has come in or gone out this month yet.", rest: "Nobody owes you anything. You owe nothing." });
  });

  it("buckets lateness as the age bar draws it", () => {
    expect([0, 1, 7, 8, 30, 31].map(moneyAge)).toEqual([0, 1, 1, 2, 2, 3]);
  });

  it("lands every coming line on what the paying accounts hold", () => {
    expect(afterComingUp(11445.2, [{ day: "2026-10-07", when: "Wed 7", label: "Rent", amount: -1200, state: null }, { day: "2026-10-14", when: "Wed 14", label: "INV-0140", amount: 1750, state: null }, { day: "2026-10-15", when: "Thu 15", label: "VAT", amount: null, state: null }])).toBe(11995.2);
  });

  it("names the paying accounts and the month so far", () => {
    expect(names(["CBZ", "CBZ", "EcoCash"])).toBe("CBZ and EcoCash");
    expect(names(["CBZ", "EcoCash", "Steward"])).toBe("CBZ, EcoCash and Steward");
    expect(shortMonthSoFar("2026-10-06")).toBe("1 to 6 Oct");
    expect(shortMonthSoFar("2026-10-01")).toBe("1 Oct");
  });
});
