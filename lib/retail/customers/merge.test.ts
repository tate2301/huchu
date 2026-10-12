/**
 * Merging a duplicate customer and taking it back out (CUS-05, W-45, W-63),
 * against the test database: the merge re-points sales, lay-bys, vouchers,
 * notes and points (each moved entry marked with where it came from), keeps
 * the chosen number and remembers the old one, fills only what the survivor
 * had none of; an invoice in Accounting stops it; the bin's restore moves back
 * exactly what moved and refuses once the moved points were spent; a binned
 * customer cannot be picked; two merges of one duplicate at once, one wins.
 */
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { listBinEntries, moveToBin, restoreFromBin } from "@/lib/retail/bin";
import { dropLoyaltyShops, ledgerRow, loyaltyShop, testSale } from "@/lib/retail/loyalty/test-fixtures";

import { CustomerRefusal } from "./create";
import { mergeCustomers, mergePreview } from "./merge";

const made: string[] = [];
afterAll(async () => {
  for (const companyId of made) {
    await prisma.retailCustomerMerge.deleteMany({ where: { companyId } });
    await prisma.retailLayby.deleteMany({ where: { companyId } });
    await prisma.retailVoucher.deleteMany({ where: { companyId } });
    await prisma.retailCustomerNote.deleteMany({ where: { companyId } });
    await prisma.crmClient.deleteMany({ where: { companyId } });
  }
  await dropLoyaltyShops(made);
}, 60_000);

let counter = 0;

/** A shop with Tapiwa Marange (3,021 points, two visits) and T. Marange (412 points, a visit, a lay-by, a voucher and a note). */
async function twoTapiwas(label: string) {
  const shop = await loyaltyShop(label);
  made.push(shop.companyId);
  counter += 1;
  const survivorId = shop.customerId;
  await prisma.customer.update({ where: { id: survivorId }, data: { phone: "+263774123388", area: "Mbare" } });
  const duplicateId = (
    await prisma.customer.create({
      data: {
        companyId: shop.companyId,
        name: "T. Marange",
        phone: "+263774123380",
        email: "tapiwa@example.test",
        area: "Avondale",
        dateOfBirth: new Date("1988-03-14T00:00:00Z"),
      },
      select: { id: true },
    })
  ).id;
  await ledgerRow(shop, { customerId: survivorId, kind: "EARNED", points: 3021 });
  await ledgerRow(shop, { customerId: duplicateId, kind: "EARNED", points: 412 });
  const survivorSales = [await testSale(shop, { total: "20.00", customerId: survivorId }), await testSale(shop, { total: "12.00", customerId: survivorId })];
  const duplicateSale = await testSale(shop, { total: "41.26", customerId: duplicateId });
  const layby = await prisma.retailLayby.create({
    data: {
      companyId: shop.companyId,
      laybyNo: `LAY-${counter}-${Date.now()}`,
      siteId: shop.mainId,
      customerId: duplicateId,
      status: "COLLECTED",
      total: "16.40",
      paid: "16.40",
      dueOn: new Date("2026-12-01T00:00:00Z"),
      createdById: shop.managerId,
    },
    select: { id: true },
  });
  const voucher = await prisma.retailVoucher.create({
    data: {
      companyId: shop.companyId,
      code: `GV-${counter}-${Date.now()}`,
      secret: "x",
      kind: "GIFT",
      funding: "GIVEN",
      expiresOn: new Date("2027-12-01T00:00:00Z"),
      customerId: duplicateId,
    },
    select: { id: true },
  });
  const note = await prisma.retailCustomerNote.create({
    data: { companyId: shop.companyId, customerId: duplicateId, body: "Prefers Castle cans." },
    select: { id: true },
  });
  return { shop, survivorId, duplicateId, survivorSales, duplicateSale, laybyId: layby.id, voucherId: voucher.id, noteId: note.id };
}

async function points(customerId: string) {
  return (await prisma.retailPointsEntry.aggregate({ where: { customerId }, _sum: { points: true } }))._sum.points ?? 0;
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

const keep = (phone: string) => ({ keepPhone: phone });

describe("merging a duplicate customer", () => {
  it("previews both ledgers and both visits as one", async () => {
    const world = await twoTapiwas("Merge preview");
    const preview = await mergePreview(world.shop.companyId, world.survivorId, world.duplicateId);
    expect(preview).toEqual({
      points: 3433,
      visits: 3,
      text: "3,433 points, 3 visits, one ledger",
      phones: ["+263 77 412 3388", "+263 77 412 3380"],
      blockers: [],
    });
  });

  it("moves sales, lay-bys, vouchers, notes and points to the survivor and marks each moved entry", async () => {
    const world = await twoTapiwas("Merge moves");
    const merged = await prisma.$transaction((tx) =>
      mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 412 3388") }),
    );
    expect(merged).toEqual({ id: world.survivorId, points: 3433, visits: 3 });
    expect(await points(world.survivorId)).toBe(3433);
    expect(await points(world.duplicateId)).toBe(0);

    expect(await prisma.retailSale.findUniqueOrThrow({ where: { id: world.duplicateSale }, select: { customerId: true } })).toEqual({ customerId: world.survivorId });
    expect(await prisma.retailLayby.findUniqueOrThrow({ where: { id: world.laybyId }, select: { customerId: true } })).toEqual({ customerId: world.survivorId });
    expect(await prisma.retailVoucher.findUniqueOrThrow({ where: { id: world.voucherId }, select: { customerId: true } })).toEqual({ customerId: world.survivorId });
    expect(await prisma.retailCustomerNote.findUniqueOrThrow({ where: { id: world.noteId }, select: { customerId: true } })).toEqual({ customerId: world.survivorId });

    const moved = await prisma.retailPointsEntry.findMany({ where: { customerId: world.survivorId, mergedFromId: world.duplicateId } });
    expect(moved.map((entry) => entry.points)).toEqual([412]);
    expect(await prisma.retailPointsEntry.count({ where: { customerId: world.survivorId, mergedFromId: null } })).toBe(1);

    const duplicate = await prisma.customer.findUniqueOrThrow({ where: { id: world.duplicateId } });
    expect(duplicate).toMatchObject({ mergedIntoId: world.survivorId, isActive: false });
    expect(duplicate.archivedAt).not.toBeNull();

    const row = await prisma.retailCustomerMerge.findUniqueOrThrow({ where: { duplicateId: world.duplicateId } });
    expect(row).toMatchObject({
      survivorId: world.survivorId,
      saleIds: [world.duplicateSale],
      laybyIds: [world.laybyId],
      voucherIds: [world.voucherId],
      noteIds: [world.noteId],
      points: 412,
      visits: 1,
      survivorPhoneBefore: null,
      accountMoved: false,
    });

    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId: world.shop.companyId, eventType: { in: ["RETAIL_CUSTOMER.MERGED", "RETAIL_RECORD.BINNED"] } },
      select: { eventType: true, entityId: true, payloadJson: true },
    });
    const mergedEvent = events.find((event) => event.eventType === "RETAIL_CUSTOMER.MERGED")!;
    expect(mergedEvent.entityId).toBe(world.survivorId);
    expect(JSON.parse(String(mergedEvent.payloadJson))).toMatchObject({
      duplicate: { id: world.duplicateId, name: "T. Marange", phone: "+263774123380" },
      keptPhone: "+263774123388",
      points: 412,
      visits: 1,
    });
    const binned = events.find((event) => event.eventType === "RETAIL_RECORD.BINNED")!;
    expect(binned.entityId).toBe(world.duplicateId);
    expect(JSON.parse(String(binned.payloadJson))).toMatchObject({ kind: "customer", name: "T. Marange, +263 77 412 3380", merged: true });

    // In the bin as "Customer, merged"; off the lookup's live list.
    const entries = await listBinEntries(world.shop.companyId);
    expect(entries.find((entry) => entry.id === world.duplicateId)).toMatchObject({ label: "Customer, merged", name: "T. Marange, +263 77 412 3380" });
  });

  it("keeps the duplicate's number when chosen and remembers the survivor's old one", async () => {
    const world = await twoTapiwas("Merge phone");
    await prisma.$transaction((tx) =>
      mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 412 3380") }),
    );
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: world.survivorId }, select: { phone: true } })).toEqual({ phone: "+263774123380" });
    expect(await prisma.retailCustomerMerge.findUniqueOrThrow({ where: { duplicateId: world.duplicateId }, select: { survivorPhoneBefore: true } })).toEqual({
      survivorPhoneBefore: "+263774123388",
    });

    await restoreFromBin(world.shop.manager(), { kind: "customer", id: world.duplicateId });
    const [survivor, duplicate] = await Promise.all([
      prisma.customer.findUniqueOrThrow({ where: { id: world.survivorId }, select: { phone: true } }),
      prisma.customer.findUniqueOrThrow({ where: { id: world.duplicateId }, select: { phone: true, mergedIntoId: true, archivedAt: true, isActive: true } }),
    ]);
    expect(survivor.phone).toBe("+263774123388");
    expect(duplicate).toEqual({ phone: "+263774123380", mergedIntoId: null, archivedAt: null, isActive: true });
  });

  it("refuses a number neither of them has", async () => {
    const world = await twoTapiwas("Merge keep");
    const refused = await refusal(
      prisma.$transaction((tx) => mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 000 0000") })),
    );
    expect(refused).toEqual({ status: 400, message: "Keep one of their two numbers.", fieldErrors: { keep: "Keep one of their two numbers." } });
  });

  it("fills only what the survivor has none of, and undo clears exactly those", async () => {
    const world = await twoTapiwas("Merge fill");
    await prisma.$transaction((tx) =>
      mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 412 3388") }),
    );
    const filled = await prisma.customer.findUniqueOrThrow({ where: { id: world.survivorId }, select: { email: true, area: true, dateOfBirth: true } });
    expect(filled).toEqual({ email: "tapiwa@example.test", area: "Mbare", dateOfBirth: new Date("1988-03-14T00:00:00Z") });
    expect((await prisma.retailCustomerMerge.findUniqueOrThrow({ where: { duplicateId: world.duplicateId } })).filledFields).toEqual(["email", "dateOfBirth"]);

    await restoreFromBin(world.shop.manager(), { kind: "customer", id: world.duplicateId });
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: world.survivorId }, select: { email: true, area: true, dateOfBirth: true } });
    expect(after).toEqual({ email: null, area: "Mbare", dateOfBirth: null });
  });

  it("stops at an invoice in Accounting with the record's sentence", async () => {
    const world = await twoTapiwas("Merge blocked");
    await prisma.crmClient.create({ data: { companyId: world.shop.companyId, clientNo: `CL-${Date.now()}`, name: "T. Marange", customerId: world.duplicateId } });
    const sentence = "T. Marange has invoices in Accounting. Merge them there.";
    expect((await mergePreview(world.shop.companyId, world.survivorId, world.duplicateId)).blockers).toEqual([sentence]);
    const refused = await refusal(
      prisma.$transaction((tx) => mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 412 3388") })),
    );
    expect(refused).toEqual({ status: 409, message: sentence, fieldErrors: {} });
    expect(await points(world.duplicateId)).toBe(412);
  });

  it("restores both balances, sales and the rest exactly", async () => {
    const world = await twoTapiwas("Merge undo");
    await prisma.$transaction((tx) =>
      mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 412 3388") }),
    );
    // A sale after the merge stays with the survivor.
    const later = await testSale(world.shop, { total: "9.00", customerId: world.survivorId });
    await ledgerRow(world.shop, { customerId: world.survivorId, kind: "EARNED", points: 9, saleId: later });

    await restoreFromBin(world.shop.manager(), { kind: "customer", id: world.duplicateId });
    expect(await points(world.survivorId)).toBe(3030);
    expect(await points(world.duplicateId)).toBe(412);
    expect(await prisma.retailPointsEntry.count({ where: { mergedFromId: world.duplicateId } })).toBe(0);
    const sales = await prisma.retailSale.findMany({ where: { companyId: world.shop.companyId }, select: { id: true, customerId: true } });
    expect(sales.filter((sale) => sale.customerId === world.duplicateId).map((sale) => sale.id)).toEqual([world.duplicateSale]);
    expect(sales.filter((sale) => sale.customerId === world.survivorId).map((sale) => sale.id).sort()).toEqual([...world.survivorSales, later].sort());
    for (const [model, id] of [
      [prisma.retailLayby, world.laybyId],
      [prisma.retailVoucher, world.voucherId],
      [prisma.retailCustomerNote, world.noteId],
    ] as const) {
      expect(await (model as typeof prisma.retailLayby).findUniqueOrThrow({ where: { id }, select: { customerId: true } })).toEqual({ customerId: world.duplicateId });
    }
    const row = await prisma.retailCustomerMerge.findUniqueOrThrow({ where: { duplicateId: world.duplicateId } });
    expect(row.undoneAt).not.toBeNull();
    expect(row.undoneById).toBe(world.shop.managerId);

    const unmerged = await prisma.platformAuditEvent.findMany({
      where: { companyId: world.shop.companyId, eventType: "RETAIL_CUSTOMER.UNMERGED" },
      select: { entityId: true, payloadJson: true },
    });
    expect(unmerged.map((event) => event.entityId).sort()).toEqual([world.survivorId, world.duplicateId].sort());
    expect(JSON.parse(String(unmerged[0]!.payloadJson))).toMatchObject({ points: 412, visits: 1 });

    // Merged again after the undo: the same row is that merge now.
    await prisma.$transaction((tx) =>
      mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 412 3388") }),
    );
    expect(await prisma.retailCustomerMerge.findUniqueOrThrow({ where: { duplicateId: world.duplicateId }, select: { undoneAt: true } })).toEqual({ undoneAt: null });
  });

  it("takes back the points written since for the duplicate's sales, a refund's REVERSED row with its EARNED", async () => {
    const world = await twoTapiwas("Merge refund since");
    // T. Marange's 41.26 earned 41 of the 412.
    await prisma.retailPointsEntry.updateMany({ where: { customerId: world.duplicateId }, data: { points: 371 } });
    await ledgerRow(world.shop, { customerId: world.duplicateId, kind: "EARNED", points: 41, saleId: world.duplicateSale });
    await prisma.$transaction((tx) =>
      mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 412 3388") }),
    );
    // Refunded after the merge: the refund and its REVERSED row land on Tapiwa.
    const refund = await testSale(world.shop, { total: "-41.26", customerId: world.survivorId, saleType: "REFUND", sourceSaleId: world.duplicateSale });
    await ledgerRow(world.shop, { customerId: world.survivorId, kind: "REVERSED", points: -41, saleId: refund });
    expect(await points(world.survivorId)).toBe(3021 + 412 - 41);

    await restoreFromBin(world.shop.manager(), { kind: "customer", id: world.duplicateId });
    expect(await points(world.survivorId)).toBe(3021);
    expect(await points(world.duplicateId)).toBe(412 - 41);
    expect(await prisma.retailSale.findUniqueOrThrow({ where: { id: refund }, select: { customerId: true } })).toEqual({ customerId: world.duplicateId });
  });

  it("refuses the undo once the survivor has spent the points that came across", async () => {
    const world = await twoTapiwas("Merge spent");
    await prisma.$transaction((tx) =>
      mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 412 3388") }),
    );
    await ledgerRow(world.shop, { customerId: world.survivorId, kind: "SPENT", points: -3200 });
    await expect(restoreFromBin(world.shop.manager(), { kind: "customer", id: world.duplicateId })).rejects.toMatchObject({
      status: 409,
      message: "Tapiwa Marange has spent points that came from T. Marange. Take them away first.",
    });
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: world.duplicateId }, select: { mergedIntoId: true } })).toEqual({ mergedIntoId: world.survivorId });
  });

  it("cannot pick itself or a customer in the bin", async () => {
    const world = await twoTapiwas("Merge binned");
    const pick = { status: 400, message: "Pick a different customer.", fieldErrors: { other: "Pick a different customer." } };
    expect(await refusal(mergePreview(world.shop.companyId, world.survivorId, world.survivorId))).toEqual(pick);
    await moveToBin(world.shop.manager(), { kind: "customer", id: world.duplicateId });
    expect(await refusal(mergePreview(world.shop.companyId, world.survivorId, world.duplicateId))).toEqual(pick);
    expect(
      await refusal(
        prisma.$transaction((tx) => mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 412 3388") })),
      ),
    ).toEqual(pick);
  });

  it("lets one of two merges of the same duplicate win", async () => {
    const world = await twoTapiwas("Merge race");
    const third = (await prisma.customer.create({ data: { companyId: world.shop.companyId, name: "Tapiwa M.", phone: "+263774123399" }, select: { id: true } })).id;
    const results = await Promise.allSettled([
      prisma.$transaction((tx) => mergeCustomers(tx, world.shop.manager(), world.survivorId, { duplicateId: world.duplicateId, ...keep("+263 77 412 3388") })),
      prisma.$transaction((tx) => mergeCustomers(tx, world.shop.owner(), third, { duplicateId: world.duplicateId, ...keep("+263 77 412 3399") })),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.retailCustomerMerge.count({ where: { duplicateId: world.duplicateId } })).toBe(1);
    expect((await points(world.survivorId)) + (await points(third))).toBe(3433);
  });
});
