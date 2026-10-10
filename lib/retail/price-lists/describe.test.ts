import { describe, expect, it } from "vitest";

import { createdSentence, listSub, pricesRule, usedWhen, type DescribedList } from "./describe";

const TODAY = "2026-10-07";

const list = (fields: Partial<DescribedList>): DescribedList => ({
  name: "Retail",
  isDefault: false,
  state: "ON",
  audience: "EVERYONE",
  whenKind: "ALWAYS",
  daysOfWeek: [],
  fromTime: null,
  toTime: null,
  startsOn: null,
  endsOn: null,
  minQuantity: 1,
  basis: "OWN",
  adjustPercent: null,
  ...fields,
});

describe("the board's five lists, in words", () => {
  it("Retail: the default", () => {
    const retail = list({ isDefault: true });
    expect(usedWhen(retail, null, TODAY)).toBe("Always, at every till");
    expect(pricesRule(retail, null, [])).toBe("Set for each product");
    expect(listSub(retail, 17)).toBe("Default price list · all tills · all sites");
  });

  it("Wholesale: account customers buying six or more", () => {
    const wholesale = list({ name: "Wholesale", audience: "ACCOUNT_CUSTOMERS", minQuantity: 6, basis: "LIST", adjustPercent: -8 });
    expect(usedWhen(wholesale, null, TODAY)).toBe("Customer on a wholesale account, 6 or more");
    expect(pricesRule(wholesale, "Retail", [])).toBe("Retail less 8%");
    expect(listSub(wholesale, 96)).toBe("Wholesale price list · 96 products");
  });

  it("Happy hour: Fridays on beer", () => {
    const happy = list({ name: "Happy hour", whenKind: "DAYS_AND_HOURS", daysOfWeek: [5], fromTime: "17:00", toTime: "19:00", basis: "LIST", adjustPercent: -10 });
    expect(usedWhen(happy, null, TODAY)).toBe("Fridays 17:00 to 19:00");
    expect(pricesRule(happy, "Retail", ["Beer"])).toBe("Retail less 10% on beer");
    expect(createdSentence(happy, "Retail", ["Beer", "Ciders"], null, TODAY)).toBe(
      "Happy hour is on: 10% off beer and ciders, Fridays 17:00 to 19:00.",
    );
  });

  it("Staff: cost plus 5%", () => {
    const staff = list({ name: "Staff", audience: "STAFF", basis: "COST", adjustPercent: 5 });
    expect(usedWhen(staff, null, TODAY)).toBe("Staff accounts");
    expect(pricesRule(staff, null, [])).toBe("Cost plus 5%");
  });

  it("Avondale branch: a draft at one site", () => {
    const avondale = list({ name: "Avondale branch", state: "DRAFT", basis: "LIST", adjustPercent: 5 });
    expect(usedWhen(avondale, "Borrowdale", TODAY)).toBe("At Borrowdale, once it is switched on");
    expect(pricesRule(avondale, "Retail", [])).toBe("Retail plus 5%");
    expect(createdSentence(avondale, "Retail", [], "Borrowdale", TODAY)).toBe("Avondale branch saved. Switch it on when it is ready.");
  });

  it("the same prices, and dates", () => {
    expect(pricesRule(list({ basis: "LIST", adjustPercent: 0 }), "Retail", [])).toBe("Same as Retail");
    const xmas = list({ whenKind: "BETWEEN_DATES", startsOn: "2026-12-01", endsOn: "2026-12-26" });
    expect(usedWhen(xmas, null, TODAY)).toBe("1 December to 26 December");
  });

  it("Ciders hour's toast", () => {
    const ciders = list({ name: "Ciders hour", whenKind: "DAYS_AND_HOURS", daysOfWeek: [6], fromTime: "16:00", toTime: "18:00", basis: "LIST", adjustPercent: -10 });
    expect(createdSentence(ciders, "Retail", ["Ciders and coolers"], null, TODAY)).toBe(
      "Ciders hour is on: 10% off ciders and coolers, Saturdays 16:00 to 18:00.",
    );
  });
});
