/**
 * Points and tiers by hand (CUS-04, W-47), against the test database: an
 * add writes ADJUSTED with its worth and who did it, a take-away stops at the
 * balance in the board's sentence, a bulk take-away skips the short and names
 * them, a till spend racing a take-away never leaves the balance below zero,
 * loyalty off refuses, and a tier is held 12 months unless it is the spend's.
 */
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { CustomerRefusal } from "@/lib/retail/customers/create";

import { adjustMany, adjustPoints, setTiers } from "./adjust";
import { balance, spendPoints } from "./ledger";
import { LOYALTY_DEFAULTS } from "./settings";
import { dropLoyaltyShops, ledgerRow, loyaltyShop, testSale } from "./test-fixtures";

const made: string[] = [];
afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: { in: made } } });
  await dropLoyaltyShops(made);
}, 60_000);

async function shopWithPoints(label: string, points: number) {
  const shop = await loyaltyShop(label);
  made.push(shop.companyId);
  if (points) await ledgerRow(shop, { customerId: shop.customerId, kind: "EARNED", points });
  return shop;
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CustomerRefusal) return { status: error.status, message: error.message, fieldErrors: error.fieldErrors };
    throw error;
  }
  return null;
}

const complaint = { direction: "ADD", points: "200", reason: "COMPLAINT", note: "Warm beer sold on 30 September." };

describe("adjusting points by hand", () => {
  it("adds points as ADJUSTED with their worth, the reason and who did it", async () => {
    const shop = await shopWithPoints("Adjust add", 3021);
    const answer = await prisma.$transaction((tx) => adjustPoints(tx, shop.manager(), shop.customerId, complaint));
    expect(answer.balance).toBe(3221);

    const entry = await prisma.retailPointsEntry.findUniqueOrThrow({ where: { id: answer.entryId } });
    expect(entry).toMatchObject({
      kind: "ADJUSTED",
      points: 200,
      reason: "COMPLAINT",
      note: "Warm beer sold on 30 September.",
      actorId: shop.managerId,
      actorName: "Tafara Nyathi",
    });
    expect(entry.value.toString()).toBe("2");
    expect(await balance(prisma, shop.customerId)).toBe(3221);

    const audit = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { companyId: shop.companyId, entityId: shop.customerId, eventType: "RETAIL_POINTS.ADJUSTED" },
      select: { payloadJson: true },
    });
    expect(JSON.parse(String(audit.payloadJson))).toMatchObject({ direction: "ADD", points: 200, reason: "COMPLAINT", balance: 3221 });
  });

  it("takes away no more than the balance, in the board's sentence", async () => {
    const shop = await shopWithPoints("Adjust take", 3221);
    const refused = await refusal(
      prisma.$transaction((tx) => adjustPoints(tx, shop.manager(), shop.customerId, { ...complaint, direction: "TAKE", points: 5000, reason: "CORRECTION" })),
    );
    const sentence = "Tapiwa Marange has 3,221 points. Take away no more than that.";
    expect(refused).toEqual({ status: 409, message: sentence, fieldErrors: { n: sentence } });

    const taken = await prisma.$transaction((tx) =>
      adjustPoints(tx, shop.manager(), shop.customerId, { ...complaint, direction: "TAKE", points: 400, reason: "CORRECTION" }),
    );
    expect(taken.balance).toBe(2821);
    const entry = await prisma.retailPointsEntry.findUniqueOrThrow({ where: { id: taken.entryId } });
    expect(entry.points).toBe(-400);
    expect(entry.value.toString()).toBe("4");
  });

  it("refuses a count that is not a whole number and a missing note", async () => {
    const shop = await shopWithPoints("Adjust rules", 0);
    const refused = await refusal(
      prisma.$transaction((tx) => adjustPoints(tx, shop.manager(), shop.customerId, { ...complaint, points: "1.5", note: " " })),
    );
    expect(refused).toMatchObject({ status: 400, fieldErrors: { n: "A whole number of points, 1 or more.", note: "Say what happened." } });
  });

  it("refuses while loyalty is off", async () => {
    const shop = await shopWithPoints("Adjust off", 100);
    await prisma.retailLoyaltySettings.create({ data: { companyId: shop.companyId, enabled: false } });
    const refused = await refusal(prisma.$transaction((tx) => adjustPoints(tx, shop.manager(), shop.customerId, complaint)));
    expect(refused).toMatchObject({ status: 409, message: "Loyalty is off." });
    expect(await refusal(adjustMany(shop.manager(), { ...complaint, ids: [shop.customerId] }))).toMatchObject({ status: 409, message: "Loyalty is off." });
  });

  it("skips customers with too few points on a bulk take-away and names them", async () => {
    const shop = await shopWithPoints("Adjust many", 500);
    const nyasha = (await prisma.customer.create({ data: { companyId: shop.companyId, name: "Nyasha Gwenzi" }, select: { id: true } })).id;
    const rudo = (await prisma.customer.create({ data: { companyId: shop.companyId, name: "Rudo Chirwa" }, select: { id: true } })).id;
    await ledgerRow(shop, { customerId: nyasha, kind: "EARNED", points: 50 });
    await ledgerRow(shop, { customerId: rudo, kind: "EARNED", points: 300 });

    const answer = await adjustMany(shop.manager(), { ...complaint, direction: "TAKE", points: 200, reason: "CORRECTION", ids: [shop.customerId, nyasha, rudo] });
    expect(answer).toEqual({ done: 2, skipped: [{ id: nyasha, name: "Nyasha Gwenzi" }] });
    expect(await balance(prisma, shop.customerId)).toBe(300);
    expect(await balance(prisma, nyasha)).toBe(50);
    expect(await balance(prisma, rudo)).toBe(100);

    const added = await adjustMany(shop.manager(), { ...complaint, points: 50, reason: "BIRTHDAY", ids: [shop.customerId, nyasha, rudo] });
    expect(added).toEqual({ done: 3, skipped: [] });
  });

  it("never lets a till spend and a take-away together leave the balance below zero", async () => {
    const shop = await shopWithPoints("Adjust race", 600);
    const saleId = await testSale(shop, { total: "10.00" });
    const spend = prisma.$transaction((tx) =>
      spendPoints(tx, {
        companyId: shop.companyId,
        customer: { id: shop.customerId, name: "Tapiwa Marange" },
        points: 500,
        value: 5,
        payable: 10,
        saleId,
        actor: { id: null, name: "Chipo Dube" },
        settings: LOYALTY_DEFAULTS,
        at: new Date(),
      }),
    );
    const take = prisma.$transaction((tx) =>
      adjustPoints(tx, shop.manager(), shop.customerId, { ...complaint, direction: "TAKE", points: 500, reason: "CORRECTION" }),
    );
    const results = await Promise.allSettled([spend, take]);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await balance(prisma, shop.customerId)).toBe(100);
  });
});

describe("changing tiers by hand", () => {
  const NOW = new Date("2026-10-03T10:00:00+02:00");

  it("holds a tier for 12 months, and choosing the spend's tier lets the hold go", async () => {
    const shop = await shopWithPoints("Tier set", 0);
    const nyasha = (await prisma.customer.create({ data: { companyId: shop.companyId, name: "Nyasha Gwenzi" }, select: { id: true } })).id;
    // US$800 in 12 months: Silver by spend, both of them.
    await testSale(shop, { total: "800.00", customerId: shop.customerId, postedAt: new Date(NOW.getTime() - 86_400_000) });
    await testSale(shop, { total: "800.00", customerId: nyasha, postedAt: new Date(NOW.getTime() - 86_400_000) });

    expect(await refusal(setTiers(shop.manager(), { ids: [nyasha], tier: "Platinum" }, NOW))).toMatchObject({
      status: 400,
      fieldErrors: { tier: "That is not a tier." },
    });

    const answer = await setTiers(shop.manager(), { ids: [shop.customerId, nyasha], tier: "Gold" }, NOW);
    expect(answer).toEqual({ count: 2, until: "2027-10-03" });
    const held = await prisma.customer.findMany({ where: { id: { in: [shop.customerId, nyasha] } }, select: { tierHeld: true, tierHeldUntil: true } });
    for (const customer of held) {
      expect(customer.tierHeld).toBe("Gold");
      expect(customer.tierHeldUntil?.toISOString().slice(0, 10)).toBe("2027-10-03");
    }
    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId: shop.companyId, eventType: "RETAIL_CUSTOMER.TIER_SET" },
      select: { payloadJson: true },
    });
    expect(events.map((event) => JSON.parse(String(event.payloadJson)))).toEqual([
      expect.objectContaining({ tier: "Gold", until: "2027-10-03" }),
      expect.objectContaining({ tier: "Gold", until: "2027-10-03" }),
    ]);

    await setTiers(shop.manager(), { ids: [nyasha], tier: "Silver" }, NOW);
    const back = await prisma.customer.findUniqueOrThrow({ where: { id: nyasha }, select: { tierHeld: true, tierHeldUntil: true } });
    expect(back).toEqual({ tierHeld: null, tierHeldUntil: null });
  });
});
