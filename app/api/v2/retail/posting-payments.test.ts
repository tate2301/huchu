import { describe, expect, it } from "vitest";

import { normalizeRetailPostingPayments } from "./_helpers";

/**
 * What a sale debits in the books (SET-05): each tender at its base amount,
 * with the change handed back taken off the cash, so a sale paid in ZiG notes
 * or with a US$5 note for US$3.90 balances against the goods.
 */
describe("a sale's tenders as the books take them", () => {
  it("takes the change off the cash", () => {
    expect(
      normalizeRetailPostingPayments({ payments: [{ tenderType: "CASH", amount: 5, currency: "USD" }], changeAmount: 1.1 }),
    ).toMatchObject([{ tenderType: "CASH", amount: 3.9, currency: "USD" }]);
  });

  it("posts ZiG notes at their base amount, less the change", () => {
    // ZiG 106 at 27.10 is US$3.91 against US$3.90.
    expect(
      normalizeRetailPostingPayments({ payments: [{ tenderType: "CASH", amount: 3.91, currency: "ZWG" }], changeAmount: 0.01 }),
    ).toMatchObject([{ tenderType: "CASH", amount: 3.9, currency: "ZWG" }]);
  });

  it("leaves the non-cash tenders whole", () => {
    expect(
      normalizeRetailPostingPayments({
        payments: [
          { tenderType: "ECOCASH", amount: 3, reference: "MP1" },
          { tenderType: "CASH", amount: 2 },
        ],
        changeAmount: 1.1,
      }).map((payment) => [payment.tenderType, payment.amount]),
    ).toEqual([
      ["ECOCASH", 3],
      ["CASH", 0.9],
    ]);
  });
});
