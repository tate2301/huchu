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
  doneOffline,
  listedReason,
  loadTillRules,
  offlineReview,
  replayedAt,
  reversalReason,
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

  it("judges a sale's refunds together, so it cannot be handed back in pieces under the limit", () => {
    // US$31.20 refunded as two halves: the first is under the limit, the second takes the sale over it.
    expect(checkTillRule(rules(), { act: "refund", amount: "15.60" })).toEqual({ needsApprover: false });
    expect(checkTillRule(rules(), { act: "refund", amount: "15.60", alreadyRefunded: "15.60" })).toEqual({
      needsApprover: true,
      reason: "Refunds over US$20.00 need a manager PIN.",
    });
    expect(checkTillRule(rules(), { act: "refund", amount: "4.40", alreadyRefunded: "15.60" })).toEqual({ needsApprover: false });
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

  it("judges each line on its own, so a big basket cannot hide one item given away", () => {
    const sixPack = { quantity: 2, unitPrice: 9.5, shelfUnitPrice: 9.5, lineDiscount: 0 };
    const tonic = { quantity: 1, unitPrice: 1.2, shelfUnitPrice: 1.2, lineDiscount: 1.2 };
    // US$1.20 off a US$20.20 basket is 5.9%, but that one line is 100% off.
    expect(saleDiscountRule(rules(), { lines: [sixPack, tonic], orderDiscount: 0, pricesExplained: false })).toEqual({
      needsApprover: true,
      reason: "Discounts over 10% need a manager PIN.",
    });
    // The same from the offline queue, whose prices the replay review explained.
    expect(saleDiscountRule(rules(), { lines: [sixPack, tonic], orderDiscount: 0, pricesExplained: true })).toEqual({
      needsApprover: true,
      reason: "Discounts over 10% need a manager PIN.",
    });
    // A price cut to nothing on one line is the same give-away.
    expect(
      saleDiscountRule(rules(), {
        lines: [sixPack, { ...tonic, unitPrice: 0, lineDiscount: 0 }],
        orderDiscount: 0,
        pricesExplained: false,
      }),
    ).toEqual({ needsApprover: true, reason: "Discounts over 10% need a manager PIN." });
    // Within the ceiling on the line, and on the sale.
    expect(
      saleDiscountRule(rules(), { lines: [sixPack, { ...tonic, lineDiscount: 0.12 }], orderDiscount: 0, pricesExplained: false }),
    ).toEqual({ needsApprover: false });
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
  it("counts a refund or void from the queue as done offline only when it says when, and that is over a minute ago", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(doneOffline(new Date("2026-10-05T11:30:00Z"), now)).toBe(true);
    expect(doneOffline(new Date("2026-10-05T11:59:00Z"), now)).toBe(true);
    expect(doneOffline(new Date("2026-10-05T11:59:30Z"), now)).toBe(false);
    expect(doneOffline(new Date("2026-10-05T12:05:00Z"), now)).toBe(false);
    expect(doneOffline(new Date("not a date"), now)).toBe(false);
    expect(doneOffline(null, now)).toBe(false);
  });

  it("takes only a listed reason, in the list's spelling", () => {
    expect(listedReason(rules(), "refund", " changed MIND ")).toBe("Changed mind");
    expect(listedReason(rules(), "void", "Test sale")).toBe("Test sale");
    expect(() => listedReason(rules(), "refund", "Felt like it")).toThrow(TillRuleRefused);
    expect(() => listedReason(rules(), "void", "Damaged")).toThrow("Pick a reason from the list.");
  });

  it("takes a reason taken off the list since from a replay, marked for review", () => {
    expect(reversalReason(rules(), "refund", "changed mind", false)).toEqual({ reason: "Changed mind", review: null });
    expect(() => reversalReason(rules(), "void", "Felt like it", false)).toThrow(TillRuleRefused);
    expect(reversalReason(rules(), "void", " Felt like it ", true)).toEqual({
      reason: "Felt like it",
      review: "Reason no longer on the list.",
    });
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
    expect(offlineReview(rules(), new Date("2026-10-04T11:00:00Z"), now)).toBe("Sold offline longer than the till rules allow");
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

describe("when a refund or void sent in late goes in", () => {
  const arrived = new Date("2026-10-06T12:00:00Z");
  const bounds = { saleAt: new Date("2026-10-06T09:00:00Z"), shiftOpenedAt: new Date("2026-10-06T08:00:00Z") };

  it("keeps the till's date when it falls after the sale and the shift's opening", () => {
    const claimed = new Date("2026-10-06T11:00:00Z");
    expect(replayedAt(claimed, bounds, arrived)).toEqual({ at: claimed, review: null });
  });

  it("enters one dated before its sale, or before its shift opened, when it arrived, for review", () => {
    const review = "Dated before its sale or its shift; entered when it arrived.";
    expect(replayedAt(new Date("2026-10-06T08:30:00Z"), bounds, arrived)).toEqual({ at: arrived, review });
    expect(
      replayedAt(new Date("2026-10-06T07:30:00Z"), { ...bounds, saleAt: new Date("2026-10-06T07:00:00Z") }, arrived),
    ).toEqual({ at: arrived, review });
  });

  it("enters one dated after it arrived (the till's clock runs ahead) when it arrived, for review", () => {
    expect(replayedAt(new Date("2026-10-06T14:00:00Z"), bounds, arrived)).toEqual({
      at: arrived,
      review: "Dated after it reached the server, so the till's clock runs ahead; entered when it arrived.",
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
        refundReasons: [" Damaged ", "Wrong   size"],
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

  it("keeps the limits inside W-64's ranges", () => {
    expect(
      checkSettingsChanges(tillRulesPage, {
        refundPinOver: "100000.01",
        cashDropPromptOver: "1000000.01",
        offlineHours: "73 hours",
      }),
    ).toEqual({
      ok: false,
      fieldErrors: {
        refundPinOver: "Keep it to 100,000 or less.",
        cashDropPromptOver: "Keep it to 1,000,000 or less.",
        offlineHours: "Keep it to 72 hours or less.",
      },
    });
    expect(
      checkSettingsChanges(tillRulesPage, { refundPinOver: "100000", cashDropPromptOver: "1,000,000", offlineHours: "72" }),
    ).toEqual({
      ok: true,
      values: { refundPinOver: "100000.00", cashDropPromptOver: "1000000.00", offlineHours: "72 hours" },
    });
  });

  it("refuses a reason already on the list, case-blind, instead of dropping it", () => {
    expect(checkSettingsChanges(tillRulesPage, { voidReasons: ["A", "a"] })).toEqual({
      ok: false,
      fieldErrors: { voidReasons: "That reason is already on the list." },
    });
  });

  it("takes 1 to 20 reasons in each list", () => {
    const reasons = (count: number) => Array.from({ length: count }, (_, index) => `Reason ${index + 1}`);
    expect(checkSettingsChanges(tillRulesPage, { refundReasons: reasons(20) })).toEqual({
      ok: true,
      values: { refundReasons: reasons(20) },
    });
    expect(checkSettingsChanges(tillRulesPage, { voidReasons: reasons(21) })).toEqual({
      ok: false,
      fieldErrors: { voidReasons: "Keep it to 20 reasons." },
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
