/**
 * Adjust stock (30-stock W-23, STK-04), against the test database: the four
 * whys and their changes, the refusals in words, the value at cost, the
 * manager's PIN over the limit (and its lockout), and the books — a loss
 * Dr Breakage (5410) / Cr Stock (1200) at its value under the movement's id,
 * which STK-03's Reverse finds and posts the exact opposite of.
 */
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { postRetailJournal } from "@/app/api/v2/retail/_helpers";
import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { ApprovalNeeded, ApprovalRefused, WRONG_PIN } from "@/lib/retail/manager-pin";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { TILL_PIN_LOCKED } from "@/lib/retail/till-pin";

import { adjustedToast, adjustmentDelta, adjustmentJournal, adjustmentPhotoFolder, adjustStock, AdjustRefused, parseHowMany } from "./adjustments";
import { reversalJournal, reverseMovements } from "./reverse";

let shop: TestShop;
let clerkId: string;
let amarula: string;
let amarulaLine: string;
let johnnie: string;

const clerk = () => ({ companyId: shop.companyId, userId: clerkId, userName: "Tendai Sibanda", userRole: "STOCK_CLERK" });
const onHand = async (lineId: string) => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: lineId } })).currentStock.toNumber();

beforeAll(async () => {
  shop = await makeTestShop("Adjust");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  clerkId = (
    await prisma.user.create({
      data: { email: `tendai-${shop.companyId}@shop.test`, name: "Tendai Sibanda", role: "STOCK_CLERK", companyId: shop.companyId },
      select: { id: true },
    })
  ).id;
  await prisma.retailTillPin.create({ data: { companyId: shop.companyId, userId: shop.managerId, pinHash: await bcrypt.hash("2580", 4) } });
  const a = await addTestProduct(shop.companyId, { name: "Amarula Cream 750ml", price: "18.25", cost: "13.03" }, { onHand: 13 });
  amarula = a.productId;
  amarulaLine = a.itemId;
  johnnie = (await addTestProduct(shop.companyId, { name: "Johnnie Walker Red 750ml", price: "45.00", cost: "33.60" }, { onHand: 10 })).productId;
}, 60_000);

beforeEach(async () => {
  await prisma.retailTillPin.updateMany({ where: { companyId: shop.companyId }, data: { failedAttempts: 0, lockedAt: null } });
});

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { reversesId: { not: null }, item: { site: { companyId } } } });
  await destroyProvisionedTenant(companyId);
});

describe("the change each why makes", () => {
  it("takes off, puts on, or sets on hand", () => {
    expect(adjustmentDelta("BROKEN", 2, 13)).toBe(-2);
    expect(adjustmentDelta("OWN_USE", 1, 13)).toBe(-1);
    expect(adjustmentDelta("FOUND", 2, 13)).toBe(2);
    expect(adjustmentDelta("CORRECTION", 11, 13)).toBe(-2);
  });

  it("refuses in words", () => {
    expect(() => adjustmentDelta("BROKEN", 20, 13)).toThrow(new AdjustRefused(400, "Only 13 on hand.", "n"));
    expect(() => adjustmentDelta("CORRECTION", 13, 13)).toThrow("That is what is on hand already.");
    expect(() => adjustmentDelta("BROKEN", 0, 13)).toThrow("Say how many.");
  });

  it("says what happened in the toast", () => {
    expect(adjustedToast("BROKEN", -2, "Amarula Cream 750ml", 11)).toBe("2 off Amarula Cream 750ml. 11 left.");
    expect(adjustedToast("FOUND", 2, "Amarula Cream 750ml", 15)).toBe("2 added to Amarula Cream 750ml. 15 on hand.");
    expect(adjustedToast("CORRECTION", -2, "Amarula Cream 750ml", 11)).toBe("Amarula Cream 750ml set to 11 on hand.");
  });
});

describe("adjustStock", () => {
  it("takes 2 broken off at cost, under an ADJ reference, named by its own movement", async () => {
    const result = await adjustStock({ actor: shop.manager(), productId: amarula, why: "BROKEN", n: "2", note: "Dropped while restocking the shelf." });
    expect(result).toMatchObject({ delta: -2, onHand: 11, value: 26.06, approvedBy: "Tafara Nyathi", message: "2 off Amarula Cream 750ml. 11 left." });
    expect(result.reference).toMatch(/^ADJ-\d{4}$/);
    const movement = await prisma.stockMovement.findUniqueOrThrow({ where: { id: result.movementId } });
    expect(movement).toMatchObject({ movementType: "ADJUSTMENT", reason: "BROKEN", reference: result.reference, sourceId: result.movementId, approvedBy: "Tafara Nyathi" });
    expect(movement.change.toNumber()).toBe(-2);
    expect(movement.balanceAfter?.toNumber()).toBe(11);
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: shop.companyId, eventType: "RETAIL_STOCK.ADJUSTED" } });
    expect(JSON.parse(audit.payloadJson ?? "{}")).toMatchObject({ reference: result.reference, why: "BROKEN", delta: -2, value: "26.06" });
  });

  it("puts found stock on and sets the number after a mistake", async () => {
    const found = await adjustStock({ actor: shop.manager(), productId: amarula, why: "FOUND", n: "2", note: "Behind the crates." });
    expect(found).toMatchObject({ delta: 2, onHand: 13 });
    const fixed = await adjustStock({ actor: shop.manager(), productId: amarula, why: "CORRECTION", n: "11", note: "Miscounted." });
    expect(fixed).toMatchObject({ delta: -2, onHand: 11, message: "Amarula Cream 750ml set to 11 on hand." });
  });

  it("refuses more than on hand, the number already there, and no note, moving nothing", async () => {
    await expect(adjustStock({ actor: shop.manager(), productId: amarula, why: "BROKEN", n: "20", note: "x" })).rejects.toThrow("Only 11 on hand.");
    await expect(adjustStock({ actor: shop.manager(), productId: amarula, why: "CORRECTION", n: "11", note: "x" })).rejects.toThrow(
      "That is what is on hand already.",
    );
    await expect(adjustStock({ actor: shop.manager(), productId: amarula, why: "BROKEN", n: "1", note: "  " })).rejects.toMatchObject({
      message: "Say what happened.",
      field: "note",
    });
    await expect(adjustStock({ actor: shop.manager(), productId: amarula, why: "BROKEN", n: "1.5", note: "x" })).rejects.toThrow(
      "Say how many, in whole units.",
    );
    expect(await onHand(amarulaLine)).toBe(11);
  });

  it("refuses more than a shop holds under How many, not as a 500", () => {
    expect(() => parseHowMany("99999999999999999999", "each")).toThrow(new AdjustRefused(400, "That is more than a shop holds.", "n"));
    expect(parseHowMany("99,999,999", "each")).toBe(99_999_999);
  });

  it("takes only a photo this shop uploaded, refusing any other address under Photo", async () => {
    const own = `https://abc.public.blob.vercel-storage.com/${adjustmentPhotoFolder(shop.companyId)}/broken.jpg`;
    for (const photoUrl of [
      "javascript:alert(1)",
      "https://example.com/broken.jpg",
      "http://abc.public.blob.vercel-storage.com/" + adjustmentPhotoFolder(shop.companyId) + "/broken.jpg",
      "https://abc.public.blob.vercel-storage.com/companies/another-shop/retail/adjustments/broken.jpg",
    ]) {
      await expect(adjustStock({ actor: shop.manager(), productId: amarula, why: "BROKEN", n: "1", note: "Dropped.", photoUrl })).rejects.toMatchObject({
        message: "Add the photo again; that one did not come from here.",
        field: "photoUrl",
      });
    }
    const result = await adjustStock({ actor: shop.manager(), productId: amarula, why: "FOUND", n: "1", note: "Behind the crates.", photoUrl: own });
    expect((await prisma.stockMovement.findUniqueOrThrow({ where: { id: result.movementId } })).photoUrl).toBe(own);
    await adjustStock({ actor: shop.manager(), productId: amarula, why: "BROKEN", n: "1", note: "Put back what was found." });
  });

  it("asks a stock clerk over US$50.00 for a manager's PIN", async () => {
    await expect(adjustStock({ actor: clerk(), productId: johnnie, why: "BROKEN", n: "2", note: "Dropped." })).rejects.toBeInstanceOf(ApprovalNeeded);
    await expect(adjustStock({ actor: clerk(), productId: johnnie, why: "BROKEN", n: "2", note: "Dropped." })).rejects.toThrow(
      "Over US$50.00 needs a manager PIN.",
    );
  });

  it("refuses a wrong PIN under the pin field, and locks on the fifth", async () => {
    const wrong = () =>
      adjustStock({ actor: clerk(), productId: johnnie, why: "BROKEN", n: "2", note: "Dropped.", approver: { userId: shop.managerId, pin: "1111" } });
    await expect(wrong()).rejects.toMatchObject({ message: WRONG_PIN, status: 409, field: "pin" });
    for (let i = 0; i < 3; i += 1) await expect(wrong()).rejects.toBeInstanceOf(ApprovalRefused);
    await expect(wrong()).rejects.toMatchObject({ message: TILL_PIN_LOCKED, status: 423 });
    const pin = await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: shop.managerId } });
    expect(pin.lockedAt).not.toBeNull();
    expect(await prisma.stockMovement.count({ where: { item: { productId: johnnie }, reason: "BROKEN" } })).toBe(0);
  });

  it("saves with Tafara's right PIN, naming her as the approver", async () => {
    const result = await adjustStock({
      actor: clerk(),
      productId: johnnie,
      why: "BROKEN",
      n: "2",
      note: "Dropped.",
      approver: { userId: shop.managerId, pin: "2580" },
    });
    expect(result).toMatchObject({ value: 67.2, approvedBy: "Tafara Nyathi", onHand: 8 });
  });

  it("asks a manager over the limit for nothing", async () => {
    const result = await adjustStock({ actor: shop.manager(), productId: johnnie, why: "OWN_USE", n: "2", note: "For the owner’s function." });
    expect(result).toMatchObject({ value: 67.2, approvedBy: "Tafara Nyathi", onHand: 6 });
  });
});

describe("the books", () => {
  const entryFor = (sourceId: string) =>
    prisma.journalEntry.findMany({
      where: { companyId: shop.companyId, sourceType: "RETAIL_STOCK_ADJUSTMENT", sourceId },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
  const sides = (lines: Array<{ debit: number; credit: number; account: { code: string } }>) =>
    lines.map((line) => ({ code: line.account.code, debit: line.debit, credit: line.credit })).sort((a, b) => a.code.localeCompare(b.code));

  it("posts a loss Dr Breakage / Cr Stock at its value, and Reverse posts the exact opposite", async () => {
    const actor = shop.manager();
    const result = await adjustStock({ actor, productId: amarula, why: "BROKEN", n: "2", note: "Dropped while restocking the shelf." });
    await postRetailJournal(adjustmentJournal(result, actor)!);
    await runRetailPosting(shop.companyId, "BY_HAND", actor);
    const [entry] = await entryFor(result.movementId);
    expect(entry).toBeDefined();
    expect(sides(entry!.lines)).toEqual([
      { code: "1200", debit: 0, credit: 26.06 },
      { code: "5410", debit: 26.06, credit: 0 },
    ]);

    const reversed = await reverseMovements({ actor, ids: [result.movementId] });
    const back = reversed.reversed[0]!;
    await postRetailJournal((await reversalJournal(back, { companyId: shop.companyId, userId: actor.userId, role: actor.userRole }))!);
    await runRetailPosting(shop.companyId, "BY_HAND", actor);
    const [opposite] = await entryFor(back.reversalId);
    expect(sides(opposite!.lines)).toEqual([
      { code: "1200", debit: 26.06, credit: 0 },
      { code: "5410", debit: 0, credit: 26.06 },
    ]);
  });

  it("reverses a loss whose posting still waits at what it will post, not at the line's cost today", async () => {
    const actor = shop.manager();
    const result = await adjustStock({ actor, productId: amarula, why: "BROKEN", n: "2", note: "Dropped while restocking the shelf." });
    // The shop posts at the end of the day: the loss waits as its accounting event.
    await postRetailJournal(adjustmentJournal(result, actor)!);
    expect(await entryFor(result.movementId)).toHaveLength(0);
    const waiting = await prisma.accountingIntegrationEvent.findFirstOrThrow({
      where: { companyId: shop.companyId, sourceType: "RETAIL_STOCK_ADJUSTMENT", sourceId: result.movementId },
    });
    expect({ status: waiting.status, amount: waiting.amount }).toEqual({ status: "PENDING", amount: 26.06 });

    // A delivery since has moved the cost.
    await prisma.inventoryItem.update({ where: { id: amarulaLine }, data: { unitCost: "15.00" } });
    try {
      const back = (await reverseMovements({ actor, ids: [result.movementId] })).reversed[0]!;
      await postRetailJournal((await reversalJournal(back, { companyId: shop.companyId, userId: actor.userId, role: actor.userRole }))!);
      await runRetailPosting(shop.companyId, "BY_HAND", actor);

      const [original] = await entryFor(result.movementId);
      const [opposite] = await entryFor(back.reversalId);
      expect(sides(original!.lines)).toEqual([
        { code: "1200", debit: 0, credit: 26.06 },
        { code: "5410", debit: 26.06, credit: 0 },
      ]);
      expect(sides(opposite!.lines)).toEqual([
        { code: "1200", debit: 26.06, credit: 0 },
        { code: "5410", debit: 0, credit: 26.06 },
      ]);
    } finally {
      await prisma.inventoryItem.update({ where: { id: amarulaLine }, data: { unitCost: "13.03" } });
    }
  });

  it("reverses one that never reached the books at the value its Activity recorded", async () => {
    const actor = shop.manager();
    const result = await adjustStock({ actor, productId: amarula, why: "OWN_USE", n: "1", note: "Taken for the owner’s function" });
    await prisma.inventoryItem.update({ where: { id: amarulaLine }, data: { unitCost: "15.00" } });
    try {
      const back = (await reverseMovements({ actor, ids: [result.movementId] })).reversed[0]!;
      const journal = await reversalJournal(back, { companyId: shop.companyId, userId: actor.userId, role: actor.userRole });
      expect(journal).toMatchObject({ amount: 13.03, invertDirection: false, sourceId: back.reversalId });
    } finally {
      await prisma.inventoryItem.update({ where: { id: amarulaLine }, data: { unitCost: "13.03" } });
    }
  });

  it("posts nothing without a cost", async () => {
    const ice = await addTestProduct(shop.companyId, { name: "Ice 2kg bag", price: "1.50" }, { onHand: 10 });
    const result = await adjustStock({ actor: shop.manager(), productId: ice.productId, why: "BROKEN", n: "1", note: "Melted." });
    expect(result.value).toBe(0);
    expect(adjustmentJournal(result, shop.manager())).toBeNull();
  });
});
