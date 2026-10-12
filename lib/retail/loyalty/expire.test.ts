import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { loyaltyToday } from "./dates";
import { expirePoints, expiryPreview } from "./expire";
import { balance } from "./ledger";
import { dropLoyaltyShops, ledgerRow, loyaltyShop } from "./test-fixtures";

const made: string[] = [];
afterAll(() => dropLoyaltyShops(made));

const monthsAgo = (months: number) => new Date(Date.now() - months * 30.5 * 86_400_000);

describe("points a year old expire", () => {
  it("takes what was earned more than 12 months ago and not spent, oldest first, once", async () => {
    const shop = await loyaltyShop("Points expiry");
    made.push(shop.companyId);
    const customerId = shop.customerId;
    await ledgerRow(shop, { customerId, kind: "EARNED", points: 100, at: monthsAgo(14) });
    await ledgerRow(shop, { customerId, kind: "EARNED", points: 50, at: monthsAgo(13) });
    await ledgerRow(shop, { customerId, kind: "SPENT", points: -80, at: monthsAgo(6) });
    // An earlier expiry already took some of the old points.
    await ledgerRow(shop, { customerId, kind: "EXPIRED", points: -20, at: monthsAgo(1) });
    await ledgerRow(shop, { customerId, kind: "EARNED", points: 200, at: monthsAgo(1) });
    const today = loyaltyToday();

    expect(await expiryPreview(shop.companyId, today)).toEqual({ customers: 1, points: 50 });
    expect(await expirePoints(shop.companyId, today)).toEqual({ customers: 1, points: 50 });
    const expired = await prisma.retailPointsEntry.findFirstOrThrow({
      where: { customerId, kind: "EXPIRED", points: -50 },
      select: { createdAt: true, actorId: true, actorName: true },
    });
    expect(expired.createdAt.toISOString()).toBe(new Date(`${today}T00:00:00+02:00`).toISOString());
    expect(expired.actorName).toBeNull();
    expect(await balance(prisma, customerId)).toBe(200);
    const audit = await prisma.platformAuditEvent.count({ where: { companyId: shop.companyId, eventType: "RETAIL_POINTS.EXPIRED", entityId: customerId } });
    expect(audit).toBe(1);

    // A second run the same day finds nothing due.
    expect(await expirePoints(shop.companyId, today)).toEqual({ customers: 0, points: 0 });
    expect(await balance(prisma, customerId)).toBe(200);
  });

  it("expires nothing while the shop's points never expire", async () => {
    const shop = await loyaltyShop("Points never expire");
    made.push(shop.companyId);
    await ledgerRow(shop, { customerId: shop.customerId, kind: "EARNED", points: 100, at: monthsAgo(14) });
    await prisma.retailLoyaltySettings.create({ data: { companyId: shop.companyId, expiry: "NEVER" } });
    expect(await expirePoints(shop.companyId, loyaltyToday())).toEqual({ customers: 0, points: 0 });
    // What turning it on would take tonight.
    expect(await expiryPreview(shop.companyId, loyaltyToday())).toEqual({ customers: 1, points: 100 });
  });
});
