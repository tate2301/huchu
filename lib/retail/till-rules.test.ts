import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { checkSettingsChanges } from "@/lib/retail/settings-pages";
import { tillRulesPage } from "@/lib/retail/settings-pages/till-rules";
import { readSettings, saveSettings } from "@/lib/retail/settings";
import { tillRulesPatch } from "@/lib/retail/settings/till-rules";

import {
  checkTillRule,
  defaultTillRules,
  discountPercent,
  listedReason,
  loadTillRules,
  offlineReview,
  saleDiscountRule,
  tenderRuleProblem,
  TillRuleRefused,
  tillRulesForTill,
  type TillRules,
} from "./till-rules";

const rules = (patch: Partial<TillRules> = {}): TillRules => ({ ...defaultTillRules(), ...patch });

describe("when the till rules ask for a manager", () => {
  it("asks for refunds over the limit, not at or under it", () => {
    expect(checkTillRule(rules(), { act: "refund", amount: "25.00" })).toEqual({
      needsApprover: true,
      reason: "Refunds over US$20.00 need a manager PIN.",
    });
    expect(checkTillRule(rules(), { act: "refund", amount: "20.00" })).toEqual({ needsApprover: false });
    expect(checkTillRule(rules(), { act: "refund", amount: 15 })).toEqual({ needsApprover: false });
  });

  it("asks for voids always, after five minutes, or never", () => {
    const saleAt = new Date("2026-10-05T10:00:00Z");
    const soon = new Date("2026-10-05T10:04:59Z");
    const later = new Date("2026-10-05T10:05:01Z");
    expect(checkTillRule(rules(), { act: "void", saleAt, at: soon })).toEqual({
      needsApprover: true,
      reason: "Voids need a manager PIN.",
    });
    const after5 = rules({ voidPin: "AFTER_5_MINUTES" });
    expect(checkTillRule(after5, { act: "void", saleAt, at: soon })).toEqual({ needsApprover: false });
    expect(checkTillRule(after5, { act: "void", saleAt, at: later })).toEqual({
      needsApprover: true,
      reason: "Voids after 5 minutes need a manager PIN.",
    });
    expect(checkTillRule(rules({ voidPin: "NEVER" }), { act: "void", saleAt, at: later })).toEqual({
      needsApprover: false,
    });
  });

  it("asks for a discount over the cashier's largest, and for a price above the shelf", () => {
    expect(checkTillRule(rules(), { act: "discount", percent: "10" })).toEqual({ needsApprover: false });
    expect(checkTillRule(rules(), { act: "discount", percent: "10.5" })).toEqual({
      needsApprover: true,
      reason: "Discounts over 10% need a manager PIN.",
    });
    expect(checkTillRule(rules(), { act: "discount", percent: 0, priceUp: true })).toEqual({
      needsApprover: true,
      reason: "A price above the shelf price needs a manager PIN.",
    });
    expect(discountPercent("3.00", "20.00").toFixed(2)).toBe("15.00");
    expect(discountPercent("3.00", "0").toFixed(2)).toBe("0.00");
  });

  it("reads a sale's discounts, price cuts and dearer prices as one rule, for the counter and the queue", () => {
    const line = { quantity: 2, unitPrice: 3.9, shelfUnitPrice: 3.9, lineDiscount: 0 };
    // US$0.70 off US$7.80 is 8.97%: within the shop's 10%.
    expect(saleDiscountRule(rules(), { lines: [line], orderDiscount: 0.7, pricesExplained: false })).toEqual({
      needsApprover: false,
    });
    // A line discount and a price cut add up: 0.40 + 2 x 0.30 = US$1.00, 12.8%.
    expect(
      saleDiscountRule(rules(), {
        lines: [{ ...line, unitPrice: 3.6, lineDiscount: 0.4 }],
        orderDiscount: 0,
        pricesExplained: false,
      }),
    ).toEqual({ needsApprover: true, reason: "Discounts over 10% need a manager PIN." });
    // A replay whose prices were explained is judged on its discounts alone.
    expect(
      saleDiscountRule(rules(), { lines: [{ ...line, unitPrice: 4.5 }], orderDiscount: 0, pricesExplained: true }),
    ).toEqual({ needsApprover: false });
    expect(
      saleDiscountRule(rules(), { lines: [{ ...line, unitPrice: 4.5 }], orderDiscount: 0, pricesExplained: false }),
    ).toEqual({ needsApprover: true, reason: "A price above the shelf price needs a manager PIN." });
  });

  it("says the refund limit in the shop's base currency", () => {
    expect(checkTillRule(rules({ currency: "ZiG", refundPinOver: new Prisma.Decimal(500) }), { act: "refund", amount: 501 })).toEqual({
      needsApprover: true,
      reason: "Refunds over ZiG500.00 need a manager PIN.",
    });
  });

  it("asks for the drawer without a sale only while that is off", () => {
    expect(checkTillRule(rules(), { act: "drawer" })).toEqual({
      needsApprover: true,
      reason: "Opening the drawer without a sale needs a manager PIN.",
    });
    expect(checkTillRule(rules({ drawerOpenWithoutSale: true }), { act: "drawer" })).toEqual({ needsApprover: false });
  });
});

describe("reasons, tenders and offline sales", () => {
  it("takes only a listed reason, in the list's spelling", () => {
    expect(listedReason(rules(), "refund", " changed MIND ")).toBe("Changed mind");
    expect(listedReason(rules(), "void", "Test sale")).toBe("Test sale");
    expect(() => listedReason(rules(), "refund", "Felt like it")).toThrow(TillRuleRefused);
    expect(() => listedReason(rules(), "void", "Damaged")).toThrow("Pick a reason from the list.");
  });

  it("refuses a second tender while split payments are off", () => {
    const two = [
      { tenderType: "CASH", reference: null },
      { tenderType: "ECOCASH", reference: "MP2410.1234" },
    ];
    expect(tenderRuleProblem(rules(), two)).toBeNull();
    expect(tenderRuleProblem(rules({ splitTender: false }), two)).toBe(
      "This shop takes one tender per sale. Split payments are off in Till rules.",
    );
  });

  it("asks card, EcoCash and InnBucks for a reference while references are on", () => {
    expect(tenderRuleProblem(rules(), [{ tenderType: "CARD", reference: "12" }])).toBe(
      "Card needs its slip or confirmation number, 4 characters or more.",
    );
    expect(tenderRuleProblem(rules(), [{ tenderType: "CASH" }])).toBeNull();
    expect(tenderRuleProblem(rules({ referenceRequired: false }), [{ tenderType: "CARD", reference: "" }])).toBeNull();
  });

  it("marks a sale kept offline longer than the rules allow", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(offlineReview(rules(), new Date("2026-10-04T13:00:00Z"), now)).toBeNull();
    expect(offlineReview(rules(), new Date("2026-10-04T11:00:00Z"), now)).toBe("Sold offline for more than 24 hours.");
  });

  it("tells the till the rules as it uses them", () => {
    expect(tillRulesForTill(rules({ referenceRequired: false }))).toMatchObject({
      refundPinOver: "20.00",
      voidPin: "ALWAYS",
      requiredReferenceTenders: [],
      minReferenceLength: 4,
      maxCashierDiscountPercent: "10.00",
      cashDropPromptOver: "500.00",
      offlineHours: 24,
    });
  });
});

describe("the Till rules page's rules", () => {
  it("reads what is typed the way the page writes it", () => {
    expect(
      checkSettingsChanges(tillRulesPage, {
        refundPinOver: "25",
        maxCashierDiscountPercent: "12.5",
        offlineHours: "48h",
        refundReasons: [" Damaged ", "damaged", "Wrong size"],
        voidPin: "After 5 minutes",
      }),
    ).toEqual({
      ok: true,
      values: {
        refundPinOver: "25.00",
        maxCashierDiscountPercent: "12.5%",
        offlineHours: "48 hours",
        refundReasons: ["Damaged", "Wrong size"],
        voidPin: "After 5 minutes",
      },
    });
  });

  it("refuses an empty list, a bad amount, a discount over 100% and no hours", () => {
    expect(
      checkSettingsChanges(tillRulesPage, {
        voidReasons: ["  "],
        cashDropPromptOver: "lots",
        maxCashierDiscountPercent: "120%",
        offlineHours: "0",
        voidPin: "Sometimes",
      }),
    ).toEqual({
      ok: false,
      fieldErrors: {
        voidReasons: "Keep at least one reason.",
        cashDropPromptOver: "Type an amount, like 20.00.",
        maxCashierDiscountPercent: "A discount cannot be more than 100%.",
        offlineHours: "Allow at least 1 hour.",
        voidPin: "Choose always, after 5 minutes or never.",
      },
    });
  });

  it("turns the page's words into the stored rules", () => {
    expect(
      tillRulesPatch({
        voidPin: "Never",
        maxCashierDiscountPercent: "15%",
        offlineHours: "12 hours",
        refundPinOver: "30.00",
      }),
    ).toEqual({ voidPin: "NEVER", maxCashierDiscountPercent: "15.00", offlineHours: 12, refundPinOver: "30.00" });
  });
});

describe("saving Till rules", () => {
  let companyId: string;
  let managerId: string;

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    companyId = (
      await prisma.company.create({ data: { name: `Till rules ${stamp}`, slug: `till-rules-${stamp}` }, select: { id: true } })
    ).id;
    managerId = (
      await prisma.user.create({
        data: { email: `manager-${stamp}@shop.test`, name: "Tafara Nyathi", role: "MANAGER", companyId },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.retailTillRules.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("reads the board's defaults before anyone saves", async () => {
    const page = await readSettings(companyId, "till-rules", true);
    expect(page?.values).toEqual({
      refundPinOver: "20.00",
      voidPin: "Always",
      refundReasons: ["Damaged", "Wrong item", "Changed mind", "Overcharged"],
      voidReasons: ["Rang up wrong", "Customer left", "Test sale"],
      splitTender: true,
      referenceRequired: true,
      maxCashierDiscountPercent: "10%",
      drawerOpenWithoutSale: false,
      cashDropPromptOver: "500.00",
      offlineHours: "24 hours",
      // The money the limits are in: the shop's base currency, read-only.
      currency: "US$",
    });
    expect(page?.lastChanged).toBeNull();
  });

  it("saves the changes, audits them once and says who changed them", async () => {
    const saved = await saveSettings(
      { companyId, userId: managerId, userName: "Tafara Nyathi", userRole: "MANAGER" },
      "till-rules",
      { voidPin: "After 5 minutes", splitTender: false, maxCashierDiscountPercent: "10" },
    );
    expect(saved).toMatchObject({ ok: true, values: { voidPin: "After 5 minutes", splitTender: false } });
    expect(saved && saved.ok && saved.lastChanged?.by).toBe("Tafara Nyathi");

    const stored = await loadTillRules(companyId);
    expect(stored.voidPin).toBe("AFTER_5_MINUTES");
    expect(stored.splitTender).toBe(false);
    expect(stored.maxCashierDiscountPercent).toEqual(new Prisma.Decimal(10));
    expect(stored.updatedById).toBe(managerId);

    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId, eventType: "RETAIL_SETTINGS.CHANGED", entityId: "till-rules" },
    });
    expect(events).toHaveLength(1);
    // "10" is what is stored already: only the two real changes are written.
    expect(JSON.parse(events[0]!.payloadJson ?? "{}").changes.map((change: { field: string }) => change.field)).toEqual([
      "voidPin",
      "splitTender",
    ]);
  });
});
