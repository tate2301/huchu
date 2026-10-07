import { describe, expect, it } from "vitest";

import { cashierFilterFor, readsEveryCashier } from "./own-rows";

const ME = "11111111-1111-4111-8111-111111111111";
const FARAI = "22222222-2222-4222-8222-222222222222";

describe("own rows: a cashier's Sales and Shifts (00-foundations 5.3.4)", () => {
  it("lets cash control read every cashier, and not the shop floor", () => {
    expect(readsEveryCashier("SUPERADMIN")).toBe(true);
    expect(readsEveryCashier("MANAGER")).toBe(true);
    expect(readsEveryCashier("SHOP_MANAGER")).toBe(true);
    expect(readsEveryCashier("CASHIER")).toBe(false);
    expect(readsEveryCashier("STOCK_CLERK")).toBe(false);
    expect(readsEveryCashier(null)).toBe(false);
  });

  it("forces a cashier onto their own rows whatever they ask for", () => {
    for (const ask of [
      {},
      { scope: "all" },
      { cashierId: "all" },
      { cashierId: FARAI },
      { scope: "mine", cashierId: FARAI },
    ]) {
      expect(cashierFilterFor({ role: "CASHIER", userId: ME, ...ask })).toBe(ME);
    }
  });

  it("gives cash control the filter it asked for", () => {
    expect(cashierFilterFor({ role: "MANAGER", userId: ME })).toBeUndefined();
    expect(cashierFilterFor({ role: "MANAGER", userId: ME, cashierId: "all" })).toBeUndefined();
    expect(cashierFilterFor({ role: "MANAGER", userId: ME, scope: "mine" })).toBe(ME);
    expect(cashierFilterFor({ role: "MANAGER", userId: ME, cashierId: "me" })).toBe(ME);
    expect(cashierFilterFor({ role: "SUPERADMIN", userId: ME, cashierId: FARAI })).toBe(FARAI);
  });
});
