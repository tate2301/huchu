/**
 * Closing a fiscal day while the tills sell (SET-08), on real rows against the
 * FDMS test connector (`scripts/fake-fdms.mjs`) behind a proxy that holds each
 * CloseDay until the test forwards it, or drops it unanswered.
 *
 * What these hold the close to: one close holds a day at a time, so a report
 * counts every receipt in its day; a sale rung while a report is on its way is
 * signed exactly once, into a day ZIMRA takes it in — the same day when the
 * close is given back, the next when the report is taken — and before anything
 * rung after it; and an offline sale that fits no day says so instead of
 * promising to wait.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { closeFiscalDay, FiscalDayCloseInProgressError } from "@/lib/accounting/fiscal-day";
import { prisma } from "@/lib/prisma";
import { fiscaliseRetailSale, fiscaliseRetailSales } from "@/lib/retail/fiscalisation";
import { saveSettings } from "@/lib/retail/settings";

import {
  closeShopFiscalDay,
  closeWaitingFiscalDays,
  connectFiscalDevice,
  openFiscalDayIfNone,
  shopFiscalDevice,
  signSalesRungWhileClosing,
} from "./fiscal-settings";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

type HeldClose = { req: IncomingMessage; res: ServerResponse; body: string };

const WAITS = (dayNo: number) => `Day ${dayNo}'s report waits for ZIMRA. This sale is signed as soon as a day is open again.`;

describe("closing a fiscal day while the tills sell", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let fake: ChildProcess;
  let fdmsUrl: string;
  let proxy: ReturnType<typeof createHttpServer>;
  let proxyUrl: string;
  let companyId: string;
  let ownerId: string;
  let siteId: string;
  let productId: string;
  let inventoryItemId: string;
  let saleSeq = 0;
  const savedUrl = process.env.ZIMRA_FDMS_API_BASE_URL;
  const owner = () => ({ companyId, userId: ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });

  // CloseDay calls queue here until the test forwards one to the connector or drops it.
  const closes: HeldClose[] = [];
  let closeArrived: (() => void) | null = null;
  const forward = async ({ req, res, body }: HeldClose) => {
    const answer = await fetch(`${fdmsUrl}${req.url}`, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: body || undefined,
    });
    res.writeHead(answer.status, { "Content-Type": "application/json" });
    res.end(await answer.text());
  };
  const drop = ({ req }: HeldClose) => req.socket.destroy();
  const closeHeld = (count: number) =>
    new Promise<void>((resolve) => {
      const check = () => (closes.length >= count ? resolve() : (closeArrived = check));
      check();
    });

  beforeAll(async () => {
    const port = await freePort();
    fdmsUrl = `http://127.0.0.1:${port}`;
    fake = spawn(process.execPath, [join(process.cwd(), "scripts/fake-fdms.mjs")], {
      env: { ...process.env, FAKE_FDMS_PORT: String(port) },
      stdio: ["ignore", "pipe", "inherit"],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The fake FDMS did not start.")), 20_000);
      fake.stdout!.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("fake FDMS on")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    process.env.ZIMRA_FDMS_API_BASE_URL = fdmsUrl;

    proxy = createHttpServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const held = { req, res, body };
        if (req.url?.endsWith("/CloseDay")) {
          closes.push(held);
          closeArrived?.();
          return;
        }
        void forward(held);
      });
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const address = proxy.address();
    proxyUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    companyId = (await prisma.company.create({ data: { name: `Mbare Races ${stamp}`, slug: `fiscal-races-${stamp}` } })).id;
    ownerId = (
      await prisma.user.create({ data: { email: `owner-races-${stamp}@shop.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId } })
    ).id;
    siteId = (await prisma.site.create({ data: { companyId, name: "Mbare", code: `MBR-${stamp}` } })).id;
    await prisma.companyBranding.create({ data: { companyId, tradingName: "Mbare Races" } });
    await prisma.taxCode.create({
      data: { companyId, code: `VAT15-${stamp}`, name: "Standard VAT", rate: 15, zimraTaxId: 1, appliesTo: "SALES" },
    });
    productId = (
      await prisma.product.create({
        data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml", standardPrice: 1.15, defaultTaxRate: 15 },
      })
    ).id;
    const location = await prisma.stockLocation.create({ data: { siteId, code: `FLOOR-${stamp}`, name: "Shop floor" } });
    inventoryItemId = (
      await prisma.inventoryItem.create({
        data: {
          itemCode: `CASTLE-${stamp}`,
          name: "Castle Lager 340ml",
          category: "BEVERAGES",
          unit: "pieces",
          siteId,
          locationId: location.id,
          currentStock: 50,
          unitCost: 0.8,
          productId,
        },
      })
    ).id;
    // By hand, so nothing but the test closes a day.
    await saveSettings(owner(), "fiscal", {
      deviceId: "0441-7777",
      serialNumber: "HC-FD-77770",
      taxpayerNumber: "2000118844",
      vatNumber: "10023881",
      dayClose: "By hand",
    });
    await connectFiscalDevice(owner(), "00112233");
  }, 60_000);

  afterAll(async () => {
    fake?.kill();
    await new Promise<void>((resolve) => (proxy ? proxy.close(() => resolve()) : resolve()));
    process.env.ZIMRA_FDMS_API_BASE_URL = savedUrl;
    if (!companyId) return;
    await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
    await prisma.fiscalDay.deleteMany({ where: { companyId } });
    await prisma.fiscalisationProviderConfig.deleteMany({ where: { companyId } });
    await prisma.retailFiscalSettings.deleteMany({ where: { companyId } });
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.retailSaleLine.deleteMany({ where: { companyId } });
    await prisma.retailSale.deleteMany({ where: { companyId } });
    await prisma.inventoryItem.deleteMany({ where: { siteId } });
    await prisma.stockLocation.deleteMany({ where: { siteId } });
    await prisma.product.deleteMany({ where: { companyId } });
    await prisma.companyBranding.deleteMany({ where: { companyId } });
    await prisma.accountingSettings.deleteMany({ where: { companyId } });
    await prisma.taxCode.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  /** A till sale of one Castle at US$1.15 with US$0.15 VAT, rung at `postedAt` and not yet signed. */
  const ringSale = (postedAt: Date = new Date()) => {
    saleSeq += 1;
    return prisma.retailSale.create({
      data: {
        companyId,
        siteId,
        saleNo: `RC-${stamp}-${saleSeq}`,
        status: "POSTED",
        postedAt,
        subtotal: 1,
        taxAmount: 0.15,
        totalAmount: 1.15,
        lines: {
          create: [
            { companyId, inventoryItemId, productId, itemName: "Castle Lager 340ml", quantity: 1, unitPrice: 1.15, taxAmount: 0.15, lineTotal: 1.15 },
          ],
        },
      },
      select: { id: true, saleNo: true, postedAt: true },
    });
  };
  const sign = (saleId: string) => fiscaliseRetailSale({ companyId, saleId, holdWhileUnreachable: true });
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  /** Where the device's calls go; ZIMRA answered last. */
  const via = async (url: string) => {
    const device = (await shopFiscalDevice(companyId))!;
    await prisma.fiscalisationProviderConfig.update({
      where: { id: device.id },
      data: { apiBaseUrl: url, lastFailedAt: null, lastOkAt: new Date() },
    });
  };
  const openDay = async () => {
    await openFiscalDayIfNone(companyId);
    return (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
  };
  const receiptOf = (saleId: string) => prisma.fiscalReceipt.findUnique({ where: { retailSaleId: saleId } });
  const waitsSince = async (saleId: string) =>
    (await prisma.retailSale.findUniqueOrThrow({ where: { id: saleId }, select: { fiscalWaitsSince: true } })).fiscalWaitsSince;

  beforeEach(async () => {
    closes.length = 0;
    closeArrived = null;
    // Every test starts with no day open.
    await via(fdmsUrl);
    const open = await prisma.fiscalDay.findFirst({ where: { companyId, status: { not: "CLOSED" } } });
    if (open) await closeShopFiscalDay(owner(), open.id);
  });

  it("refuses a second close while one holds the day, and the report counts every receipt the day took (S4)", async () => {
    await via(proxyUrl);
    const day = await openDay();
    const a = await ringSale();
    expect(await sign(a.id)).toMatchObject({ fiscalStatus: "SUCCESS" });

    const first = closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    await closeHeld(1);
    // By hand again, and from the books' console: one close at a time, and nothing more goes to ZIMRA.
    await expect(closeShopFiscalDay(owner(), day.id)).rejects.toMatchObject({
      status: 409,
      code: "FISCAL_DAY_CLOSE_IN_PROGRESS",
      message: `Day ${day.fiscalDayNo} is already being closed. Its report is on its way to ZIMRA.`,
    });
    await expect(closeFiscalDay({ dayId: day.id, companyId, closingSignature: "console" })).rejects.toBeInstanceOf(
      FiscalDayCloseInProgressError,
    );
    expect(closes).toHaveLength(1);

    // ZIMRA never answers the first: the day is given back to the tills.
    drop(closes[0]);
    expect(await first).toMatchObject({ status: 502 });
    expect((await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } })).status).toBe("OPENED");
    await via(fdmsUrl);
    const w = await ringSale();
    expect(await sign(w.id)).toMatchObject({ fiscalStatus: "SUCCESS" });
    expect((await receiptOf(w.id))?.fiscalDayId).toBe(day.id);

    await closeShopFiscalDay(owner(), day.id);
    const closed = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    const counters = JSON.parse(closed.countersJson!) as { receiptCount: number; lastReceiptCounter: number };
    expect(closed).toMatchObject({ status: "CLOSED", closingSince: null });
    expect(counters.receiptCount).toBe(await prisma.fiscalReceipt.count({ where: { fiscalDayId: day.id } }));
    expect(counters.receiptCount).toBe(2);
    expect(counters.lastReceiptCounter).toBe(closed.lastReceiptCounter);
  });

  it("signs a sale rung during a close ZIMRA never answers into the day given back, once, before the next sale (S5)", async () => {
    await via(proxyUrl);
    const day = await openDay();
    const a = await ringSale();
    expect(await sign(a.id)).toMatchObject({ fiscalStatus: "SUCCESS" });
    await pause(20);

    const closing = closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    await closeHeld(1);
    const y = await ringSale();
    expect(await sign(y.id)).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null, fiscalError: WAITS(day.fiscalDayNo) });
    expect(await waitsSince(y.id)).toBeInstanceOf(Date);

    // The CloseDay socket drops: day n is given back, and the sale that waited on it goes in straight away.
    drop(closes[0]);
    expect(await closing).toMatchObject({
      status: 502,
      message: expect.stringContaining(`ZIMRA did not answer, so day ${day.fiscalDayNo} stays open`),
    });
    expect((await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } })).status).toBe("OPENED");
    const yReceipt = await receiptOf(y.id);
    expect(yReceipt).toMatchObject({ fiscalDayId: day.id, signature: expect.any(String) });
    expect(await waitsSince(y.id)).toBeNull();

    // The shop keeps selling into the day; the next sale goes after it.
    await via(fdmsUrl);
    await pause(20);
    const z = await ringSale();
    const zSigned = await sign(z.id);
    expect(zSigned).toMatchObject({ fiscalStatus: "SUCCESS" });
    expect(zSigned.receiptGlobalNo!).toBeGreaterThan(yReceipt!.receiptGlobalNo!);

    await closeShopFiscalDay(owner(), day.id);
    const closed = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(JSON.parse(closed.countersJson!)).toMatchObject({ receiptCount: 3 });
    expect(await receiptOf(y.id)).toMatchObject({ id: yReceipt!.id, status: "SUCCESS", fiscalDayId: day.id });
    expect(await closeWaitingFiscalDays(companyId)).toBe("nothing waiting");
    expect(await prisma.fiscalReceipt.count({ where: { retailSaleId: y.id } })).toBe(1);
  });

  it("signs a sale that waited before a newer one even when the day was given back without it (S5)", async () => {
    await via(fdmsUrl);
    const day = await openDay();
    const a = await ringSale();
    expect(await sign(a.id)).toMatchObject({ fiscalStatus: "SUCCESS" });
    // A close takes the day, a sale waits on it, and the close dies having given the day back but before signing it.
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSING", closingSince: new Date() } });
    await pause(20);
    const y = await ringSale();
    expect(await sign(y.id)).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null });
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "OPENED", closingSince: null } });

    await pause(20);
    const z = await ringSale();
    const zSigned = await sign(z.id);
    expect(zSigned).toMatchObject({ fiscalStatus: "SUCCESS" });
    const yReceipt = await receiptOf(y.id);
    expect(yReceipt).toMatchObject({ fiscalDayId: day.id, status: "SUCCESS" });
    expect(yReceipt!.receiptGlobalNo!).toBeLessThan(zSigned.receiptGlobalNo!);
    expect(await waitsSince(y.id)).toBeNull();
  });

  it("counts each waiting sale once when the close and the worker sign them at the same moment (S6)", async () => {
    await via(fdmsUrl);
    const day = await openDay();
    const a = await ringSale();
    expect(await sign(a.id)).toMatchObject({ fiscalStatus: "SUCCESS" });
    await pause(20);
    // The report is taken and the close stops before signing what waited.
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSING", closingSince: new Date() } });
    const y1 = await ringSale();
    const y2 = await ringSale();
    expect(await sign(y1.id)).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null });
    expect(await sign(y2.id)).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null });
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSED", closingSince: null, closedAt: new Date() } });

    const said = await Promise.all([
      signSalesRungWhileClosing(companyId),
      signSalesRungWhileClosing(companyId),
      closeWaitingFiscalDays(companyId),
      signSalesRungWhileClosing(companyId),
    ]);
    const counted = said.reduce<number>(
      (sum, value) => sum + (typeof value === "number" ? value : Number(/^(\d+) sales? rung/.exec(value)?.[1] ?? 0)),
      0,
    );
    expect(counted).toBe(2);
    expect(await signSalesRungWhileClosing(companyId)).toBe(0);

    const next = await prisma.fiscalDay.findMany({ where: { companyId, fiscalDayNo: { gt: day.fiscalDayNo } } });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ status: "OPENED", lastReceiptCounter: 2 });
    const receipts = await prisma.fiscalReceipt.findMany({ where: { retailSaleId: { in: [y1.id, y2.id] } }, orderBy: { receiptGlobalNo: "asc" } });
    expect(receipts.map((receipt) => [receipt.retailSaleId, receipt.fiscalDayId])).toEqual([
      [y1.id, next[0].id],
      [y2.id, next[0].id],
    ]);
  });

  it("says an offline sale rung before the closing day's last receipt is not signed, and signs one rung after it (S7)", async () => {
    await via(proxyUrl);
    const day = await openDay();
    await pause(30);
    const earlier = new Date();
    await pause(30);
    const a = await ringSale();
    expect(await sign(a.id)).toMatchObject({ fiscalStatus: "SUCCESS" });
    await pause(30);
    const later = new Date();
    await pause(30);

    const closing = closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    await closeHeld(1);
    // The till's offline queue arrives (pos/sync's drain) while the report is on its way.
    const before = await ringSale(earlier);
    const after = await ringSale(later);
    const [beforeOutcome, afterOutcome] = await fiscaliseRetailSales({
      companyId,
      saleIds: [before.id, after.id],
      holdWhileUnreachable: true,
    });
    expect(beforeOutcome).toMatchObject({
      fiscalStatus: "FAILED",
      fiscalReceiptId: null,
      errorCode: "RETAIL_SALE_BEFORE_LAST_RECEIPT",
      fiscalError: `${before.saleNo} was rung before day ${day.fiscalDayNo}'s last receipt, and day ${day.fiscalDayNo} is closing. ZIMRA takes no receipt dated before the last one it took, so it is not signed.`,
    });
    expect(await waitsSince(before.id)).toBeNull();
    expect(afterOutcome).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null, fiscalError: WAITS(day.fiscalDayNo) });

    await forward(closes[0]);
    expect(await closing).toBeUndefined();
    const next = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    expect(next.fiscalDayNo).toBe(day.fiscalDayNo + 1);
    expect(next.openedAt.getTime()).toBeLessThanOrEqual(after.postedAt!.getTime());
    expect(await receiptOf(after.id)).toMatchObject({ fiscalDayId: next.id, status: "SUCCESS", receiptCounter: 1 });
    expect(await receiptOf(before.id)).toBeNull();
    expect(await closeWaitingFiscalDays(companyId)).toBe("nothing waiting");
  });

  it("signs the sales that waited before a till sale that opened the next day first, in the order they were rung (S9)", async () => {
    await via(fdmsUrl);
    const day = await openDay();
    const a = await ringSale();
    expect(await sign(a.id)).toMatchObject({ fiscalStatus: "SUCCESS" });
    await pause(20);
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSING", closingSince: new Date() } });
    const y = await ringSale();
    expect(await sign(y.id)).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null });
    await pause(30);
    // The report is taken and the close stops before signing what waited.
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSED", closingSince: null, closedAt: new Date() } });

    // A till sale commits first, and opens the next day as pos/sales does, then is signed.
    await pause(30);
    const t = await ringSale();
    await openFiscalDayIfNone(companyId, t.postedAt!);
    expect(await sign(t.id)).toMatchObject({ fiscalStatus: "SUCCESS" });

    const next = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    expect(next.openedAt.getTime()).toBeLessThanOrEqual(y.postedAt!.getTime());
    const rows = await prisma.fiscalReceipt.findMany({
      where: { fiscalDayId: next.id },
      orderBy: { receiptGlobalNo: "asc" },
      select: { retailSaleId: true, status: true, retailSale: { select: { postedAt: true } } },
    });
    expect(rows.map((row) => row.retailSaleId)).toEqual([y.id, t.id]);
    expect(rows.every((row) => row.status === "SUCCESS")).toBe(true);
    const dates = rows.map((row) => row.retailSale!.postedAt!.getTime());
    expect([...dates].sort((p, q) => p - q)).toEqual(dates);
    expect(await closeWaitingFiscalDays(companyId)).toBe("nothing waiting");
  });
});
