import { describe, expect, it } from "vitest";

import { normalizeRetailPostingPayments } from "./_helpers";
import { postedChange } from "./_services";

/**
 * What a sale debits in the books (SET-05, W-05): each tender at its base
 * amount, with the change handed back taken off the cash in the notes it was
 * given in, so a sale paid in ZiG notes or with a US$5 note for US$3.90
 * balances against the goods, and each cash account loses what its drawer gave.
 */
describe("a sale's tenders as the books take them", () => {
  it("takes the change off the cash", () => {
    expect(
      normalizeRetailPostingPayments({
        payments: [{ tenderType: "CASH", amount: 5, currency: "USD" }],
        change: { usd: 1.1, zig: 0 },
      }),
    ).toMatchObject([{ tenderType: "CASH", amount: 3.9, currency: "USD" }]);
  });

  it("posts ZiG notes at their base amount, less the change", () => {
    // ZiG 106 at 27.10 is US$3.91 against US$3.90; nothing is handed back.
    expect(
      normalizeRetailPostingPayments({ payments: [{ tenderType: "CASH", amount: 3.91, currency: "ZWG" }], change: { usd: 0, zig: 0 } }),
    ).toMatchObject([{ tenderType: "CASH", amount: 3.91, currency: "ZWG" }]);
  });

  it("takes dollar change off the dollar cash and ZiG change off the ZiG cash, whatever their order", () => {
    expect(
      normalizeRetailPostingPayments({
        payments: [
          { tenderType: "CASH", amount: 2, currency: "ZWG" },
          { tenderType: "CASH", amount: 5, currency: "USD" },
        ],
        change: { usd: 3, zig: 0.41 },
      }).map((payment) => [payment.currency, payment.amount]),
    ).toEqual([
      ["ZWG", 1.59],
      ["USD", 2],
    ]);
  });

  it("takes what one currency's cash cannot cover off the other's", () => {
    // US$5 for US$3.90, change US$1 and ZiG 3 (US$0.11): no ZiG came in.
    expect(
      normalizeRetailPostingPayments({
        payments: [{ tenderType: "CASH", amount: 5, currency: "USD" }],
        change: { usd: 1, zig: 0.11 },
      }).map((payment) => [payment.currency, payment.amount]),
    ).toEqual([["USD", 3.89]]);
  });

  it("leaves the non-cash tenders whole", () => {
    expect(
      normalizeRetailPostingPayments({
        payments: [
          { tenderType: "ECOCASH", amount: 3, reference: "MP1" },
          { tenderType: "CASH", amount: 2 },
        ],
        change: { usd: 1.1, zig: 0 },
      }).map((payment) => [payment.tenderType, payment.amount]),
    ).toEqual([
      ["ECOCASH", 3],
      ["CASH", 0.9],
    ]);
  });
});

describe("a sale's change as the books take it", () => {
  const sale = { saleType: "SALE", totalAmount: 3.9, depositAmount: 0 };

  it("splits dollars from ZiG and finds what the rounding left", () => {
    // US$5 for US$3.90: US$1.10 owed, handed back US$1 and ZiG 3 at 27.10 (US$0.11).
    expect(postedChange({ ...sale, tenderedAmount: 5, changeAmount: 1.11, changeZig: 3 })).toEqual({
      usd: 1,
      zig: 0.11,
      kept: 0,
      given: 0.01,
    });
    // ZiG 106 at 27.10 for US$3.90: a cent owed rounds to no ZiG, and the shop keeps it.
    expect(postedChange({ ...sale, tenderedAmount: 3.91, changeAmount: 0, changeZig: 0 })).toEqual({
      usd: 0,
      zig: 0,
      kept: 0.01,
      given: 0,
    });
  });

  it("is all dollars on a refund, and on a sale with no ZiG in its change", () => {
    expect(postedChange({ ...sale, tenderedAmount: 5, changeAmount: 1.1, changeZig: 0 })).toEqual({ usd: 1.1, zig: 0, kept: 0, given: 0 });
    expect(
      postedChange({ saleType: "REFUND", totalAmount: -3.9, depositAmount: 0, tenderedAmount: -3.9, changeAmount: 0, changeZig: 0 }),
    ).toEqual({ usd: 0, zig: 0, kept: 0, given: 0 });
  });
});
