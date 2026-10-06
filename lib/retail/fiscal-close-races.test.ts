/**
 * Closing a fiscal day while the tills sell (SET-08), on real rows against the
 * FDMS test connector (`scripts/fake-fdms.mjs`) behind a proxy that holds each
 * CloseDay until the test forwards it, or drops it unanswered.
 *
 * A sale settles its fiscal day in the transaction that records it
 * (`assignRetailSaleFiscalDay`), under a lock on the device's day that the
 * close's claim also takes: it is signed into the open day before the claim,
 * or marked to wait after it. Only the send to ZIMRA comes after the commit.
 * What these hold the close to: one close holds a day at a time, so a report
 * counts every receipt in its day; a sale rung while a report is on its way is
 * signed exactly once, into a day ZIMRA takes it in — the same day when the
 * close is given back, the next when the report is taken — and before anything
 * rung after it; receipts are dated in the order they are signed; an offline
 * sale that fits no day says so instead of promising to wait; and a close
 * taken over after ZIMRA took the dead close's report records it, without
 * sending it again.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDayOnDevice } from "@/lib/accounting/fdms-device";
import {
  claimFiscalDayClosing,
  closeFiscalDay,
  FISCAL_DAY_CLOSE_LEASE_MS,
  FiscalDayCloseInProgressError,
} from "@/lib/accounting/fiscal-day";
import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import {
  assignRetailSaleFiscalDay,
  fiscaliseRetailSale,
  fiscaliseRetailSales,
  signWaitingSales,
  type RetailFiscalOutcome,
} from "@/lib/retail/fiscalisation";
import { saveSettings } from "@/lib/retail/settings";

import {
  closeShopFiscalDay,
  closeWaitingFiscalDays,
  connectFiscalDevice,
  openFiscalDayIfNone,
  shopFiscalDevice,
} from "./fiscal-settings";

// Only the sign-in is faked, for the bursts through POST /pos/sales.
const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

const { POST: SELL } = await import("@/app/api/v2/retail/pos/sales/route");

// Real rows, a real connector and bursts of concurrent sales: well past vitest's five seconds.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

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
type RungSale = { id: string; saleNo: string; postedAt: Date | null; assigned: RetailFiscalOutcome };

const WAITS = (dayNo: number) => `Day ${dayNo}'s report waits for ZIMRA. This sale is signed as soon as a day is open again.`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("closing a fiscal day while the tills sell", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let fake: ChildProcess;
  let fdmsUrl: string;
  let proxy: ReturnType<typeof createHttpServer>;
  let proxyUrl: string;
  let companyId: string;
  let ownerId: string;
  let cashierId: string;
  let siteId: string;
  let productId: string;
  let inventoryItemId: string;
  let shiftId: string;
  const deviceKey = `races-key-${stamp}`;
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
    cashierId = (
      await prisma.user.create({ data: { email: `chipo-races-${stamp}@shop.test`, name: "Chipo Dube", role: "CASHIER", companyId, password: "x" } })
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
          currentStock: 5000,
          unitCost: 0.8,
          productId,
        },
      })
    ).id;
    // A paired till with a cashier's shift open on it, for the sales rung through POST /pos/sales.
    const till = await prisma.retailRegister.create({ data: { companyId, siteId, code: `FRONT-${stamp}`, name: "Front till" } });
    const device = await prisma.retailDevice.create({
      data: { companyId, registerId: till.id, kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(deviceKey), pairedById: ownerId },
    });
    shiftId = (
      await prisma.retailShift.create({
        data: {
          companyId,
          shiftNo: `SH-${stamp}`,
          registerCode: till.code,
          registerName: till.name,
          registerId: till.id,
          deviceId: device.id,
          siteId,
          cashierId,
          cashierName: "Chipo Dube",
        },
      })
    ).id;
    validateSessionMock.mockResolvedValue({
      session: {
        user: { id: cashierId, companyId, role: "CASHIER", name: "Chipo Dube", email: `chipo-races-${stamp}@shop.test`, enabledFeatures: ["retail.core"] },
      },
    });
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
    const sales = { sale: { companyId } };
    await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
    await prisma.fiscalDay.deleteMany({ where: { companyId } });
    await prisma.fiscalisationProviderConfig.deleteMany({ where: { companyId } });
    await prisma.retailFiscalSettings.deleteMany({ where: { companyId } });
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.retailMessage.deleteMany({ where: { companyId } });
    await prisma.retailSalePayment.deleteMany({ where: sales });
    await prisma.retailSaleLine.deleteMany({ where: { companyId } });
    await prisma.retailSale.deleteMany({ where: { companyId } });
    await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
    await prisma.inventoryItem.deleteMany({ where: { siteId } });
    await prisma.retailShift.deleteMany({ where: { companyId } });
    await prisma.retailDevice.deleteMany({ where: { companyId } });
    await prisma.retailRegister.deleteMany({ where: { companyId } });
    await prisma.stockLocation.deleteMany({ where: { siteId } });
    await prisma.product.deleteMany({ where: { companyId } });
    await prisma.companyBranding.deleteMany({ where: { companyId } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
    await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
    await prisma.postingRule.deleteMany({ where: { companyId } });
    await prisma.accountingSettings.deleteMany({ where: { companyId } });
    await prisma.taxCode.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  /** One Castle at US$1.15 with US$0.15 VAT, written in `tx` and not yet settled. */
  const createSale = (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], postedAt: Date) => {
    saleSeq += 1;
    return tx.retailSale.create({
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
      select: { id: true, saleNo: true },
    });
  };
  /**
   * A sale committed as the sale services commit one: its fiscal day settled as the last step of the same
   * transaction. Rung now, or rung offline at `offlineAt` and sent in late (pos/sync).
   */
  const ringSale = (offlineAt?: Date): Promise<RungSale> =>
    prisma.$transaction(async (tx) => {
      const sale = await createSale(tx, offlineAt ?? new Date());
      const assigned = await assignRetailSaleFiscalDay(tx, { companyId, saleId: sale.id, rungNow: !offlineAt });
      return { ...sale, postedAt: assigned.postedAt, assigned: assigned.outcome };
    });
  /** What the till does once its sale has committed: send what the commit signed. */
  const sign = (sale: RungSale) => fiscaliseRetailSale({ companyId, saleId: sale.id, assigned: sale.assigned, holdWhileUnreachable: true });
  /** pos/sales: the sale commits, then is sent. */
  const tillSale = async () => {
    const sale = await ringSale();
    return { sale, outcome: await sign(sale) };
  };
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
  const countSigned = (placed: RetailFiscalOutcome[]) => placed.filter((sale) => sale.fiscalReceiptId).length;

  /**
   * Every promise the close makes, over the days opened since `since`: counters gap-free, no receipt dated
   * before its day opened, before the receipt ahead of it or before the last day's last receipt, every report
   * counting every receipt its day holds, and no signed sale still marked waiting.
   */
  async function audit(since: Date): Promise<string[]> {
    const problems: string[] = [];
    const days = await prisma.fiscalDay.findMany({ where: { companyId, createdAt: { gte: since } }, orderBy: { fiscalDayNo: "asc" } });
    let lastOfPrevious: number | null = null;
    for (const day of days) {
      const receipts = await prisma.fiscalReceipt.findMany({
        where: { fiscalDayId: day.id },
        orderBy: { receiptGlobalNo: "asc" },
        include: { retailSale: { select: { postedAt: true, saleNo: true } } },
      });
      receipts.forEach((receipt, index) => {
        if (receipt.receiptCounter !== index + 1) problems.push(`day ${day.fiscalDayNo}: counter ${receipt.receiptCounter} at ${index + 1}`);
      });
      if (day.lastReceiptCounter !== receipts.length) problems.push(`day ${day.fiscalDayNo}: holds ${receipts.length}, counts ${day.lastReceiptCounter}`);
      let ahead: number | null = null;
      for (const receipt of receipts) {
        const at = receipt.retailSale!.postedAt!.getTime();
        const name = receipt.retailSale!.saleNo;
        if (at < day.openedAt.getTime()) problems.push(`day ${day.fiscalDayNo}: ${name} dated before the day opened`);
        if (ahead !== null && at < ahead) problems.push(`day ${day.fiscalDayNo}: ${name} dated before the receipt ahead of it`);
        if (lastOfPrevious !== null && at < lastOfPrevious) problems.push(`day ${day.fiscalDayNo}: ${name} dated before the last day's last receipt`);
        ahead = at;
      }
      if (ahead !== null) lastOfPrevious = ahead;
      if (day.status === "CLOSED") {
        const report = JSON.parse(day.countersJson ?? "{}") as { receiptCount?: number; lastReceiptCounter?: number };
        if (report.receiptCount !== receipts.length) problems.push(`day ${day.fiscalDayNo}: report counts ${report.receiptCount}, day holds ${receipts.length}`);
        if (report.lastReceiptCounter !== day.lastReceiptCounter) problems.push(`day ${day.fiscalDayNo}: report's last counter differs`);
        if (day.closingSince) problems.push(`day ${day.fiscalDayNo}: closed with a hold`);
      }
    }
    const marked = await prisma.retailSale.count({ where: { companyId, fiscalWaitsSince: { not: null }, fiscalReceipt: { isNot: null } } });
    if (marked) problems.push(`${marked} signed sales still marked waiting`);
    return problems;
  }

  /** Close whatever day is not closed, as a close that succeeds. */
  async function closeEverything() {
    await via(fdmsUrl);
    const open = await prisma.fiscalDay.findFirst({ where: { companyId, status: { not: "CLOSED" } } });
    if (!open) return;
    await prisma.fiscalDay.update({ where: { id: open.id }, data: { closingSince: null } });
    await closeShopFiscalDay(owner(), open.id);
  }

  beforeEach(async () => {
    closes.length = 0;
    closeArrived = null;
    // Every test starts with no day open and nothing waiting.
    await closeEverything();
  });

  it("refuses a second close while one holds the day, and the report counts every receipt the day took (S4)", async () => {
    await via(proxyUrl);
    const day = await openDay();
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });

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
    const w = await tillSale();
    expect(w.outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    expect((await receiptOf(w.sale.id))?.fiscalDayId).toBe(day.id);

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
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });

    const closing = closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    await closeHeld(1);
    const y = await ringSale();
    expect(y.assigned).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null, fiscalError: WAITS(day.fiscalDayNo) });
    expect(await sign(y)).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null, fiscalError: WAITS(day.fiscalDayNo) });
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
    const z = await tillSale();
    expect(z.outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    expect(z.outcome.receiptGlobalNo!).toBeGreaterThan(yReceipt!.receiptGlobalNo!);

    await closeShopFiscalDay(owner(), day.id);
    const closed = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(JSON.parse(closed.countersJson!)).toMatchObject({ receiptCount: 3 });
    expect(await receiptOf(y.id)).toMatchObject({ id: yReceipt!.id, status: "SUCCESS", fiscalDayId: day.id });
    expect(await closeWaitingFiscalDays(companyId)).toBe("nothing waiting");
    expect(await prisma.fiscalReceipt.count({ where: { retailSaleId: y.id } })).toBe(1);
  });

  it("signs a sale that waited before a newer one even when the day was given back without it (S5)", async () => {
    const day = await openDay();
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    // A close takes the day, a sale waits on it, and the close dies having given the day back but before signing it.
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSING", closingSince: new Date() } });
    const y = await ringSale();
    expect(y.assigned).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null });
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "OPENED", closingSince: null } });

    // The next sale waits behind it in its own commit, and its send signs them both, oldest first.
    const z = await ringSale();
    expect(z.assigned).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null });
    const zSigned = await sign(z);
    expect(zSigned).toMatchObject({ fiscalStatus: "SUCCESS" });
    const yReceipt = await receiptOf(y.id);
    expect(yReceipt).toMatchObject({ fiscalDayId: day.id, status: "SUCCESS" });
    expect(yReceipt!.receiptGlobalNo!).toBeLessThan(zSigned.receiptGlobalNo!);
    expect(await waitsSince(y.id)).toBeNull();
    expect(await waitsSince(z.id)).toBeNull();
  });

  it("counts each waiting sale once when the close and the worker sign them at the same moment (S6)", async () => {
    const day = await openDay();
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    // The report is taken and the close stops before signing what waited.
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSING", closingSince: new Date() } });
    const y1 = await ringSale();
    const y2 = await ringSale();
    expect([y1.assigned, y2.assigned]).toMatchObject([
      { fiscalStatus: "PENDING", fiscalReceiptId: null },
      { fiscalStatus: "PENDING", fiscalReceiptId: null },
    ]);
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSED", closingSince: null, closedAt: new Date() } });

    const said = await Promise.all([
      signWaitingSales(companyId).then(countSigned),
      signWaitingSales(companyId).then(countSigned),
      closeWaitingFiscalDays(companyId),
      signWaitingSales(companyId).then(countSigned),
    ]);
    const counted = said.reduce<number>(
      (sum, value) => sum + (typeof value === "number" ? value : Number(/^(\d+) sales? rung/.exec(value)?.[1] ?? 0)),
      0,
    );
    expect(counted).toBe(2);
    expect(await signWaitingSales(companyId)).toEqual([]);

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
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    await pause(30);
    const later = new Date();
    await pause(30);

    const closing = closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    await closeHeld(1);
    // The till's offline queue arrives (pos/sync) while the report is on its way: each settled in its commit.
    const before = await ringSale(earlier);
    const after = await ringSale(later);
    const [beforeOutcome, afterOutcome] = await fiscaliseRetailSales({
      companyId,
      sales: [before, after].map((sale) => ({ saleId: sale.id, assigned: sale.assigned })),
      holdWhileUnreachable: true,
    });
    expect(beforeOutcome).toMatchObject({
      fiscalStatus: "FAILED",
      fiscalReceiptId: null,
      errorCode: "RETAIL_SALE_BEFORE_LAST_RECEIPT",
      fiscalError: `${before.saleNo} was rung before day ${day.fiscalDayNo}'s last receipt. ZIMRA takes no receipt dated before the last one it took, so it is not signed.`,
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

  it("signs the sales that waited before a till sale rung once the next day could open, in the order they were rung (S9)", async () => {
    const day = await openDay();
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSING", closingSince: new Date() } });
    const y = await ringSale();
    expect(y.assigned).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null });
    // The report is taken and the close stops before signing what waited.
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSED", closingSince: null, closedAt: new Date() } });

    // A till sale commits first: it opens nothing ahead of the sale that waits, but waits behind it, and its send signs both.
    const t = await tillSale();
    expect(t.sale.assigned).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null });
    expect(t.outcome).toMatchObject({ fiscalStatus: "SUCCESS" });

    const next = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    expect(next.openedAt.getTime()).toBeLessThanOrEqual(y.postedAt!.getTime());
    const rows = await prisma.fiscalReceipt.findMany({
      where: { fiscalDayId: next.id },
      orderBy: { receiptGlobalNo: "asc" },
      select: { retailSaleId: true, status: true, retailSale: { select: { postedAt: true } } },
    });
    expect(rows.map((row) => row.retailSaleId)).toEqual([y.id, t.sale.id]);
    expect(rows.every((row) => row.status === "SUCCESS")).toBe(true);
    const dates = rows.map((row) => row.retailSale!.postedAt!.getTime());
    expect([...dates].sort((p, q) => p - q)).toEqual(dates);
    expect(await closeWaitingFiscalDays(companyId)).toBe("nothing waiting");
  });

  it("signs a till sale that commits while the day closes into the next day once the report is taken, whenever its send runs (A8a)", async () => {
    await via(proxyUrl);
    const since = new Date();
    const day = await openDay();
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    const closing = closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    await closeHeld(1);

    // pos/sales: the sale commits — marked to wait, in its commit — and ZIMRA's answer lands before its send.
    const w = await ringSale();
    expect(w.assigned).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null, fiscalError: WAITS(day.fiscalDayNo) });
    await forward(closes[0]);
    expect(await closing).toBeUndefined();
    const next = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    expect(await sign(w)).toMatchObject({ fiscalStatus: "SUCCESS", fiscalReceiptId: (await receiptOf(w.id))!.id });

    expect(await receiptOf(w.id)).toMatchObject({ fiscalDayId: next.id, status: "SUCCESS", receiptCounter: 1 });
    expect(await waitsSince(w.id)).toBeNull();
    expect(w.postedAt!.getTime()).toBeGreaterThanOrEqual(next.openedAt.getTime());
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    expect(await closeWaitingFiscalDays(companyId)).toBe("nothing waiting");
    expect(await audit(since)).toEqual([]);
  });

  it("signs the waiting sale before another till's sale rung after the report is taken (A8b)", async () => {
    await via(proxyUrl);
    const since = new Date();
    const day = await openDay();
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    const closing = closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    await closeHeld(1);
    const w = await ringSale();
    await forward(closes[0]);
    await closing;

    // Another till rings a sale before W's own send runs.
    const t = await tillSale();
    expect(t.outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    expect(await sign(w)).toMatchObject({ fiscalStatus: "SUCCESS" });
    const [wReceipt, tReceipt] = [await receiptOf(w.id), await receiptOf(t.sale.id)];
    expect(wReceipt).toMatchObject({ status: "SUCCESS" });
    expect(wReceipt!.fiscalDayId).toBe(tReceipt!.fiscalDayId);
    expect(wReceipt!.receiptGlobalNo!).toBeLessThan(tReceipt!.receiptGlobalNo!);
    expect(await closeWaitingFiscalDays(companyId)).toBe("nothing waiting");
    expect(await audit(since)).toEqual([]);
  });

  /** A10: 30 till sales, each committed then sent as pos/sales does, while a close is taken mid-burst. */
  async function burstAcrossAClose(ring: () => Promise<{ saleId: string }>) {
    await via(proxyUrl);
    const since = new Date();
    const day = await openDay();
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });
    closes.length = 0;
    const closing = closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    await closeHeld(1);
    const burst = Array.from({ length: 30 }, async (_, index) => {
      await pause(index * 3);
      return ring();
    });
    await pause(45);
    await forward(closes[0]);
    const rung = await Promise.all(burst);
    expect(await closing).toBeUndefined();

    const unsigned: string[] = [];
    for (const { saleId } of rung) {
      const receipt = await receiptOf(saleId);
      if (receipt?.status !== "SUCCESS") unsigned.push(`${saleId}: ${receipt?.status ?? "no receipt"}`);
    }
    expect(unsigned).toEqual([]);
    expect(await prisma.retailSale.count({ where: { companyId, fiscalWaitsSince: { not: null } } })).toBe(0);
    expect(await closeWaitingFiscalDays(companyId)).toBe("nothing waiting");
    expect(await audit(since)).toEqual([]);
    const closed = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(closed.status).toBe("CLOSED");
    return closed;
  }

  it("signs every one of 30 till sales racing a close taken mid-burst, each dated no earlier than its day, five times running (A10)", async () => {
    for (let round = 1; round <= 5; round += 1) {
      let waited = 0;
      await burstAcrossAClose(async () => {
        const { sale, outcome } = await tillSale();
        if (!sale.assigned.fiscalReceiptId) waited += 1;
        // Signed and sent; or still on its way to ZIMRA (signed, the close sending it); or, sent while the report
        // was still on its way, told it waits. Never refused.
        expect(["SUCCESS", "PENDING"]).toContain(outcome.fiscalStatus);
        return { saleId: sale.id };
      });
      // The burst spans the close: some of it committed while the report was on its way, and waited.
      expect(waited).toBeGreaterThan(0);
      await closeEverything();
    }
  });

  it("settles the day in the sale's own commit through POST /pos/sales: in the day before the claim, waiting during it, in the next day after", async () => {
    let n = 0;
    const sell = async () => {
      n += 1;
      const response = await SELL(
        new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/sales", {
          method: "POST",
          headers: { cookie: `${DEVICE_COOKIE}=${deviceKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            clientRef: `route-${stamp}-${n}`,
            shiftId,
            items: [{ productId, quantity: 1 }],
            payments: [{ tenderType: "CASH", currency: "USD", amount: 5 }],
          }),
        }),
      );
      expect(response.status).toBe(201);
      return (await response.json()) as { id: string; postedAt: string; fiscal: { status: string; error: string | null } };
    };
    await via(proxyUrl);
    const since = new Date();
    // No day open: the first sale opens one in its commit.
    const first = await sell();
    expect(first.fiscal).toMatchObject({ status: "SUCCESS", error: null });
    const day = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    expect(await receiptOf(first.id)).toMatchObject({ fiscalDayId: day.id, status: "SUCCESS" });
    expect(day.openedAt.getTime()).toBeLessThanOrEqual(new Date(first.postedAt).getTime());

    const closing = closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    await closeHeld(1);
    const during = await sell();
    expect(during.fiscal).toMatchObject({ status: "PENDING", error: WAITS(day.fiscalDayNo) });
    expect(await waitsSince(during.id)).toBeInstanceOf(Date);
    await forward(closes[0]);
    expect(await closing).toBeUndefined();

    const after = await sell();
    expect(after.fiscal).toMatchObject({ status: "SUCCESS", error: null });
    const next = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    const rows = await prisma.fiscalReceipt.findMany({ where: { fiscalDayId: next.id }, orderBy: { receiptGlobalNo: "asc" } });
    expect(rows.map((row) => row.retailSaleId)).toEqual([during.id, after.id]);
    expect(JSON.parse((await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } })).countersJson!)).toMatchObject({ receiptCount: 1 });
    expect(await audit(since)).toEqual([]);
  });

  it("dates two tills' receipts in the order they are signed when the earlier sale's commit is slower and a close claims between (A11)", async () => {
    await via(proxyUrl);
    const since = new Date();
    const day = await openDay();
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });

    // Till 1 starts its sale first, and is slow to reach the last step of its commit.
    let resume!: () => void;
    const resumed = new Promise<void>((resolve) => (resume = resolve));
    let reached!: () => void;
    const started = new Promise<void>((resolve) => (reached = resolve));
    const slow = prisma.$transaction(async (tx) => {
      const sale = await createSale(tx, new Date());
      reached();
      await resumed;
      const assigned = await assignRetailSaleFiscalDay(tx, { companyId, saleId: sale.id, rungNow: true });
      return { ...sale, postedAt: assigned.postedAt, assigned: assigned.outcome };
    });
    await started;
    await pause(5);
    // Till 2 commits after it started, and is signed into the day.
    const u = await tillSale();
    expect(u.outcome).toMatchObject({ fiscalStatus: "SUCCESS", fiscalReceiptId: expect.any(String) });
    const closing = closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    await closeHeld(1);

    // Till 1's commit lands now: the day is closing, so it waits — dated when it was decided, after till 2's.
    resume();
    const t = await slow;
    expect(t.assigned).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null, fiscalError: WAITS(day.fiscalDayNo) });
    expect(t.postedAt!.getTime()).toBeGreaterThanOrEqual(u.sale.postedAt!.getTime());
    await forward(closes[0]);
    expect(await closing).toBeUndefined();

    expect(await sign(t)).toMatchObject({ fiscalStatus: "SUCCESS" });
    const closed = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(JSON.parse(closed.countersJson!)).toMatchObject({ receiptCount: 2 });
    expect((await receiptOf(t.id))!.fiscalDayId).not.toBe(day.id);
    expect(await audit(since)).toEqual([]);
  });

  it("records a day whose report ZIMRA took from a close that died, taken over without sending the report again", async () => {
    await via(proxyUrl);
    const day = await openDay();
    expect((await tillSale()).outcome).toMatchObject({ fiscalStatus: "SUCCESS" });

    // A close takes the day, ZIMRA takes its report, and the close dies before it writes the day closed.
    await claimFiscalDayClosing(day.id, prisma, new Date(Date.now() - FISCAL_DAY_CLOSE_LEASE_MS - 60_000));
    const device = (await shopFiscalDevice(companyId))!;
    const taken = await closeDayOnDevice({
      provider: { ...device, apiBaseUrl: fdmsUrl },
      deviceId: day.deviceId,
      fiscalDayNo: day.fiscalDayNo,
      receiptCounter: 1,
      counters: [],
      signature: { hash: "dead-close", signature: "dead-close" },
    });
    expect(taken.status).toBe("SUCCESS");
    // A sale rung meanwhile waits.
    const w = await ringSale();
    expect(w.assigned).toMatchObject({ fiscalStatus: "PENDING", fiscalReceiptId: null });

    // The next close takes it over: ZIMRA says the day is closed, so it is recorded closed, its report counted and signed.
    await closeShopFiscalDay(owner(), day.id);
    expect(closes).toHaveLength(0);
    const closed = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(closed).toMatchObject({ status: "CLOSED", closingSince: null, closingSignature: expect.any(String) });
    expect(JSON.parse(closed.countersJson!)).toMatchObject({ receiptCount: 1, lastReceiptCounter: 1 });
    const next = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    expect(await receiptOf(w.id)).toMatchObject({ fiscalDayId: next.id, status: "SUCCESS" });
  });
});
