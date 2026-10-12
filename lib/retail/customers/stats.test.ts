/**
 * A customer's record figures (CUS-03, packet 61): the five KPIs with their
 * value, lead, tone and note, first years and no visits; the meter's three
 * forms; and Usually buys. Pure: no database.
 */
import { describe, expect, it } from "vitest";

import { customerKpis, customerMeter, usuallyBuys, type CustomerFacts } from "./stats";

const NOW = new Date("2026-10-03T10:00:00+02:00");
const TIERS = [
  { name: "Bronze", from: "0.00" },
  { name: "Silver", from: "500.00" },
  { name: "Gold", from: "1500.00" },
];

const TAPIWA: CustomerFacts = {
  spend12m: 3021.8,
  spendBefore: 2561.58,
  visits: 141,
  visitsBefore: 126,
  points: 3021,
  worth: 30.21,
  spendFrom: 500,
  lastVisitAt: new Date("2026-08-15T14:02:00+02:00"),
};

const kpi = (facts: Partial<CustomerFacts>, label: string, now = NOW) =>
  customerKpis({ ...TAPIWA, ...facts }, now).find((entry) => entry.label === label)!;

describe("the record's five figures", () => {
  it("reads Tapiwa Marange as the board does", () => {
    expect(customerKpis(TAPIWA, NOW)).toEqual([
      { label: "Spend, 12 months", value: "US$3,021.80", lead: "+18%", leadTone: "ok", note: "on the 12 before" },
      { label: "Visits", value: "141", lead: "2.6", leadTone: "plain", note: "days apart" },
      { label: "Average basket", value: "US$21.43", lead: "+US$1.10", leadTone: "ok", note: "on last year" },
      { label: "Points", value: "3,021", lead: "US$30.21", leadTone: "plain", note: "to spend" },
      { label: "Last visit", value: "15 Aug", lead: "49", leadTone: "warn", note: "days ago, usually 3" },
    ]);
  });

  it("says less spend and a smaller basket in bad", () => {
    expect(kpi({ spend12m: 2400, spendBefore: 2561.58 }, "Spend, 12 months")).toMatchObject({ lead: "−6%", leadTone: "bad" });
    expect(kpi({ spend12m: 2400 }, "Average basket")).toMatchObject({ value: "US$17.02", lead: "−US$3.31", leadTone: "bad" });
  });

  it("calls a customer with nothing in the 12 before in their first year", () => {
    const first = { spendBefore: 0, visitsBefore: 0 };
    expect(kpi(first, "Spend, 12 months")).toEqual({ label: "Spend, 12 months", value: "US$3,021.80", note: "their first year" });
    expect(kpi(first, "Average basket")).toEqual({ label: "Average basket", value: "US$21.43", note: "their first year" });
  });

  it("says too few to tell under two visits, and no visits yet with none", () => {
    expect(kpi({ visits: 1 }, "Visits")).toEqual({ label: "Visits", value: "1", note: "too few to tell" });
    const none = { visits: 0, spend12m: 0, lastVisitAt: null };
    expect(kpi(none, "Average basket")).toEqual({ label: "Average basket", value: "—", note: "no visits yet" });
    expect(kpi(none, "Last visit")).toEqual({ label: "Last visit", value: "—", note: "no visits yet" });
  });

  it("asks for Spend from under it", () => {
    expect(kpi({ points: 412, worth: 4.12 }, "Points")).toMatchObject({ value: "412", lead: "US$4.12", note: "to spend from 500" });
  });

  it("reads a visit today, another year's, and a recent one without warning", () => {
    expect(kpi({ lastVisitAt: new Date("2026-10-03T08:00:00+02:00") }, "Last visit")).toEqual({
      label: "Last visit",
      value: "Today",
      note: "usually 3 days apart",
    });
    expect(kpi({ lastVisitAt: new Date("2025-09-30T12:00:00+02:00") }, "Last visit").value).toBe("30 Sep 2025");
    expect(kpi({ lastVisitAt: new Date("2026-09-25T12:00:00+02:00") }, "Last visit")).toMatchObject({ lead: "8", leadTone: "plain" });
  });
});

describe("the meter", () => {
  it("measures the way to the next tier in whole dollars, with the months at this rate", () => {
    expect(customerMeter({ tiers: TIERS, spend12m: 1120.4, tier: "Silver", heldUntil: null })).toEqual({
      label: "Silver, on the way to Gold",
      value: "US$1,120 of US$1,500",
      pct: (1120.4 / 1500) * 100,
      note: "US$380 more, about 5 months at this rate",
    });
    expect(customerMeter({ tiers: TIERS, spend12m: 1450, tier: "Silver", heldUntil: null }).note).toBe("US$50 more, within a month at this rate");
  });

  it("says the top tier and what keeps it", () => {
    expect(customerMeter({ tiers: TIERS, spend12m: 3021.8, tier: "Gold", heldUntil: null })).toEqual({
      label: "Gold, the top tier",
      value: "US$3,021 in 12 months",
      pct: 100,
      note: "Stays Gold while they spend US$1,500 in 12 months.",
    });
  });

  it("says a held tier and until when", () => {
    expect(customerMeter({ tiers: TIERS, spend12m: 800, tier: "Gold", heldUntil: "2027-10-03" }).label).toBe("Gold, held until 3 October 2027");
  });
});

describe("usually buys", () => {
  const products = [
    { name: "Chibuku Scud 1L", visits: 40 },
    { name: "Castle Lager case of 24", visits: 77 },
    { name: "Coca-Cola 2l", visits: 9 },
  ];

  it("names the products on most visits and the tender on at least half", () => {
    expect(usuallyBuys({ visits: 141, products, tenders: [{ tender: "ECOCASH", visits: 85 }, { tender: "CARD", visits: 56 }] })).toEqual({
      most: "Castle Lager case of 24",
      then: "Chibuku Scud 1L",
      paysWith: "EcoCash, mostly",
    });
  });

  it("names two ways when none paid half", () => {
    expect(
      usuallyBuys({ visits: 100, products, tenders: [{ tender: "ECOCASH", visits: 45 }, { tender: "CASH", visits: 40 }, { tender: "CARD", visits: 15 }] }).paysWith,
    ).toBe("EcoCash or cash");
  });

  it("is dashes with no visits", () => {
    expect(usuallyBuys({ visits: 0, products: [], tenders: [] })).toEqual({ most: "—", then: "—", paysWith: "—" });
  });
});
