/**
 * Change many prices over time (PRD-07, W-15), against the test database:
 * "Tonight, after closing" is 22:00 on the shop's clock (tomorrow's once it
 * has passed), a date must be from tomorrow, a scheduled batch moves no price
 * until it comes due, then applies once with its BULK history and one
 * RETAIL_PRICE.CHANGED each; Undo cancels only what is still waiting, stops its
 * shelf labels and says so in Activity; a price typed now calls off what was
 * scheduled for it; two saves of one price take turns; and the worker and a
 * till's price read racing on the same due rows apply each once.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { hashDeviceKey } from "@/lib/retail/devices";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { applyDuePriceChanges, changePrices, defaultPriceList, PriceRefusal } from "./change";
import { applyDuePriceChangesForAll, cancelBatch, changeMany, ChangeManyRefusal, dateAt, tonightAt } from "./schedule";
import { saveWorksheet } from "./worksheet";

let shop: TestShop;
let listId: string;
let castle: string;
let chibuku: string;

beforeAll(async () => {
  shop = await makeTestShop("Schedule");
  castle = (await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" })).productId;
  chibuku = (await addTestProduct(shop.companyId, { name: "Chibuku Scud 1L", price: "1.10", cost: "0.82" })).productId;
  listId = (await defaultPriceList(prisma, shop.companyId)).id;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailDevice.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

const priceOf = async (productId: string) =>
  (await prisma.productPrice.findFirstOrThrow({ where: { priceListId: listId, productId } })).unitPrice.toFixed(2);
const changedEvents = (productId: string) =>
  prisma.platformAuditEvent.count({ where: { entityId: productId, eventType: "RETAIL_PRICE.CHANGED" } });

describe("when a batch takes effect", () => {
  it("is tonight at 22:00 in Harare, or tomorrow's once it has passed", () => {
    // Wednesday 7 October 2026, 12:00 in Harare (UTC+2).
    expect(tonightAt(new Date("2026-10-07T10:00:00Z"))).toEqual({ at: new Date("2026-10-07T20:00:00Z"), tomorrow: false });
    // 23:00 in Harare: tomorrow's closing.
    expect(tonightAt(new Date("2026-10-07T21:00:00Z"))).toEqual({ at: new Date("2026-10-08T20:00:00Z"), tomorrow: true });
    // The shop keeps no Sunday hours of its own: Sunday closes at 22:00 as well.
    expect(tonightAt(new Date("2026-10-04T08:00:00Z")).at).toEqual(new Date("2026-10-04T20:00:00Z"));
  });

  it("is a date's 00:00 in Harare, from tomorrow", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    expect(dateAt("2026-10-15", now)).toEqual(new Date("2026-10-14T22:00:00Z"));
    expect(dateAt("2026-10-07", now)).toBeNull();
    expect(dateAt("2026-10-01", now)).toBeNull();
    expect(dateAt("15 October", now)).toBeNull();
  });
});

describe("changeMany", () => {
  it("refuses a date that is not from tomorrow, under its field", async () => {
    await expect(
      changeMany(shop.owner(), { listId, lines: [{ productId: castle, price: "1.30", labels: 0 }], when: "DATE", date: "2020-01-01", printLabels: false }),
    ).rejects.toMatchObject({ status: 400, fieldErrors: { date: "Pick a date from tomorrow." } });
  });

  it("schedules tonight without moving a price, then applies once when due, with BULK history", async () => {
    const result = await changeMany(shop.owner(), {
      listId,
      lines: [
        { productId: castle, price: "1.30", labels: 1 },
        { productId: chibuku, price: "1.15", labels: 1 },
      ],
      when: "TONIGHT",
      printLabels: false,
    });
    const at = tonightAt(new Date());
    expect(result.data).toMatchObject({ applied: false, effectiveAt: at.at.toISOString(), labelsJobId: null, pdfUrl: null });
    expect(result.message).toBe(`2 prices change ${at.tomorrow ? "tomorrow" : "tonight"} at 22:00.`);
    expect(await priceOf(castle)).toBe("1.20");
    const scheduled = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: listId, eventType: "RETAIL_PRICE.SCHEDULED" } });
    expect(JSON.parse(scheduled.payloadJson ?? "{}")).toMatchObject({ count: 2, batchId: result.data.batchId, effectiveAt: at.at.toISOString() });

    // Not due yet: nothing moves.
    expect(await applyDuePriceChanges(shop.companyId)).toBe(0);
    const later = new Date(at.at.getTime() + 60_000);
    expect(await applyDuePriceChanges(shop.companyId, later)).toBe(2);
    expect(await applyDuePriceChanges(shop.companyId, later)).toBe(0);
    expect(await priceOf(castle)).toBe("1.30");
    const rows = await prisma.productPriceChange.findMany({ where: { batchId: result.data.batchId } });
    expect(rows.map((row) => [row.source, row.fromPrice?.toFixed(2), row.toPrice?.toFixed(2), row.appliedAt?.toISOString()]).sort()).toEqual(
      [
        ["BULK", "1.10", "1.15", later.toISOString()],
        ["BULK", "1.20", "1.30", later.toISOString()],
      ].sort(),
    );
    expect(await changedEvents(castle)).toBe(1);
  });

  it("changes now with the toast's words, and says nothing of labels when none were asked", async () => {
    const result = await changeMany(shop.owner(), { listId, lines: [{ productId: castle, price: "1.35", labels: 1 }], when: "NOW", printLabels: false });
    expect(result).toMatchObject({ data: { applied: true }, message: "1 price changed." });
    expect(await priceOf(castle)).toBe("1.35");
  });

  it("refuses a manager's line below cost with its sentence under the line, and saves nothing", async () => {
    const refusal = await changeMany(shop.manager(), {
      listId,
      lines: [
        { productId: chibuku, price: "1.20", labels: 1 },
        { productId: castle, price: "0.80", labels: 1 },
      ],
      when: "NOW",
      printLabels: false,
    }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ChangeManyRefusal);
    expect(refusal).toMatchObject({
      status: 400,
      message: "1 price was not saved.",
      fieldErrors: { "lines.1": "Below cost needs the owner. It costs US$0.86." },
    });
    expect(await priceOf(chibuku)).toBe("1.15");
  });
});

describe("Undo", () => {
  it("cancels only the rows still waiting", async () => {
    const result = await changeMany(shop.owner(), { listId, lines: [{ productId: chibuku, price: "1.25", labels: 0 }], when: "TONIGHT", printLabels: false });
    expect(await cancelBatch(shop.owner(), result.data.batchId)).toEqual({
      data: { cancelled: 1 },
      message: "Undone. The prices stay as they are.",
    });
    const undone = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: listId, eventType: "RETAIL_PRICE.SCHEDULE_CANCELLED" } });
    expect(JSON.parse(undone.payloadJson ?? "{}")).toMatchObject({ count: 1, batchId: result.data.batchId, effectiveAt: result.data.effectiveAt });
    expect(await applyDuePriceChanges(shop.companyId, new Date(Date.now() + 3 * 86_400_000))).toBe(0);
    expect(await priceOf(chibuku)).toBe("1.15");
    // Nothing left to cancel: it is said, not ignored.
    await expect(cancelBatch(shop.owner(), result.data.batchId)).rejects.toMatchObject({ status: 409 });
    await expect(cancelBatch(shop.owner(), "6d1f3c7e-0000-4000-8000-000000000000")).rejects.toMatchObject({ status: 404 });
  });
});

describe("Undo and the shelf labels", () => {
  it("stops the labels still waiting for the till, so none prints a price that never comes", async () => {
    const register = (
      await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId: shop.mainId, code: "FRONT", name: "Front till" }, select: { id: true } })
    ).id;
    await prisma.retailDevice.create({
      data: { companyId: shop.companyId, registerId: register, kind: "BROWSER", keyHash: hashDeviceKey(`front-${register}`), pairedById: shop.ownerId },
    });
    const queued = await changeMany(shop.owner(), {
      listId,
      lines: [{ productId: castle, price: "2.50", labels: 2 }],
      when: "TONIGHT",
      printLabels: true,
    });
    expect(queued.message).toMatch(/Labels are queued\.$/);
    const job = () => prisma.retailPrintJob.findUniqueOrThrow({ where: { id: queued.data.labelsJobId! } });
    expect(await job()).toMatchObject({ status: "QUEUED", registerId: register });
    expect((await job()).payload).toMatchObject({ batchId: queued.data.batchId, labels: [{ price: "US$2.50", copies: 2 }] });

    const undone = await cancelBatch(shop.owner(), queued.data.batchId);
    expect(undone.message).toBe("Undone. The prices stay as they are.");
    expect(await job()).toMatchObject({ status: "FAILED", error: "Undone" });

    // Printed already: the toast says which shelves to see to.
    const printed = await changeMany(shop.owner(), { listId, lines: [{ productId: castle, price: "2.60", labels: 1 }], when: "TONIGHT", printLabels: true });
    await prisma.retailPrintJob.update({ where: { id: printed.data.labelsJobId! }, data: { status: "PRINTED", printedAt: new Date() } });
    expect((await cancelBatch(shop.owner(), printed.data.batchId)).message).toBe(
      "Undone. The prices stay as they are. The new labels printed already; take them off the shelf.",
    );
  });
});

describe("a price typed while a change waits", () => {
  it("calls off what was scheduled for that product, and says so", async () => {
    const before = await priceOf(castle);
    const scheduled = await changeMany(shop.owner(), { listId, lines: [{ productId: castle, price: "3.90", labels: 0 }], when: "TONIGHT", printLabels: false });
    const saved = await saveWorksheet(shop.owner(), listId, [{ id: castle, value: "3.50", was: before }]);
    expect(saved.message).toBe("1 price saved. The till has it now. 1 change scheduled for later was cancelled.");
    expect(await applyDuePriceChanges(shop.companyId, new Date(Date.now() + 3 * 86_400_000))).toBe(0);
    expect(await priceOf(castle)).toBe("3.50");
    const row = await prisma.productPriceChange.findFirstOrThrow({ where: { batchId: scheduled.data.batchId } });
    expect(row.cancelledAt).not.toBeNull();
  });
});

describe("two saves of one price at the same moment", () => {
  it("take turns, so the history links from one to the next", async () => {
    const start = await priceOf(chibuku);
    const save = (price: string) =>
      prisma.$transaction((tx) =>
        changePrices(tx, {
          companyId: shop.companyId,
          actor: shop.owner(),
          listId,
          rows: [{ productId: chibuku, price }],
          source: "TYPED",
          limits: { priceChanges: "MANAGERS", belowCostNeedsOwner: true },
        }),
      );
    const since = new Date();
    await Promise.all([save("3.10"), save("3.20")]);
    const history = await prisma.productPriceChange.findMany({
      where: { productId: chibuku, priceListId: listId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    });
    const steps = history.map((row) => [row.fromPrice?.toFixed(2), row.toPrice?.toFixed(2)]);
    expect(steps).toHaveLength(2);
    expect(steps[0]![0]).toBe(start);
    expect(steps[1]![0]).toBe(steps[0]![1]);
    expect(await priceOf(chibuku)).toBe(steps[1]![1]);
  });

  it("refuses the second worksheet save over a price it did not see", async () => {
    const start = await priceOf(chibuku);
    const results = await Promise.allSettled([
      saveWorksheet(shop.owner(), listId, [{ id: chibuku, value: "3.30", was: start }]),
      saveWorksheet(shop.owner(), listId, [{ id: chibuku, value: "3.40", was: start }]),
    ]);
    const refused = results.filter((result) => result.status === "rejected");
    expect(refused).toHaveLength(1);
    const reason = (refused[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(PriceRefusal);
    expect(Object.values((reason as PriceRefusal).refused)[0]).toMatch(/^Changed by someone else since you opened the list\. It is now US\$3\.[34]0\.$/);
  });
});

describe("the race", () => {
  it("applies each row once when the worker and a till's price read reach it together", async () => {
    const result = await changeMany(shop.owner(), {
      listId,
      lines: [
        { productId: castle, price: "1.40", labels: 0 },
        { productId: chibuku, price: "1.30", labels: 0 },
      ],
      when: "TONIGHT",
      printLabels: false,
    });
    // The test helper: the batch comes due.
    await prisma.productPriceChange.updateMany({ where: { batchId: result.data.batchId }, data: { effectiveAt: new Date(Date.now() - 60_000) } });
    const before = [await changedEvents(castle), await changedEvents(chibuku)];
    const [worker, read] = await Promise.all([applyDuePriceChangesForAll(), applyDuePriceChanges(shop.companyId)]);
    expect(worker).toMatch(/^\d+ applied$/);
    const rows = await prisma.productPriceChange.findMany({ where: { batchId: result.data.batchId } });
    expect(rows.every((row) => row.appliedAt !== null)).toBe(true);
    expect(read).toBeLessThanOrEqual(2);
    expect([await changedEvents(castle), await changedEvents(chibuku)]).toEqual([before[0]! + 1, before[1]! + 1]);
    expect([await priceOf(castle), await priceOf(chibuku)]).toEqual(["1.40", "1.30"]);
    expect(await prisma.productPriceChange.count({ where: { batchId: result.data.batchId } })).toBe(2);
  });
});
