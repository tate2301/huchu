/**
 * Fiscal device (SET-08, W-06) on real rows, against the FDMS test connector
 * (`scripts/fake-fdms.mjs`, run here on a port of its own): the page's rules,
 * what it loads and saves, Connect, Test a receipt, Close day, the day that
 * closes with the last shift and opens with the first, and Stop selling.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { closeRetailShiftTransaction } from "@/app/api/v2/retail/_services";
import { readSettings, saveSettings } from "@/lib/retail/settings";
import { checkSettingsChanges } from "@/lib/retail/settings-pages";
import { fiscalPage } from "@/lib/retail/settings-pages/fiscal";
import { fiscaliseRetailSale } from "@/lib/retail/fiscalisation";

import {
  closeFiscalDayIfLastShift,
  closeShopFiscalDay,
  connectFiscalDevice,
  fiscalSaleRefusal,
  FiscalRefused,
  openFiscalDayIfNone,
  shopFiscalDevice,
  testFiscalDevice,
  tillFiscal,
} from "./fiscal-settings";

describe("the Fiscal device page's rules", () => {
  it("is read by the fiscal grant and changed by its update", () => {
    expect(fiscalPage.read).toEqual(["retail.fiscal", "view"]);
    expect(fiscalPage.change).toEqual(["retail.fiscal", "update"]);
    expect(fiscalPage.whoCanChange).toBe("Owners only. Device details come from ZIMRA when you register.");
  });

  it("checks the device's numbers and the two rules", () => {
    expect(
      checkSettingsChanges(fiscalPage, {
        deviceId: "HC 0441",
        taxpayerNumber: "123",
        vatNumber: "1002388",
        dayClose: "At midnight",
      }),
    ).toEqual({
      ok: false,
      fieldErrors: {
        deviceId: "Type the device ID as ZIMRA gave it: digits, grouped with a dash if you like.",
        taxpayerNumber: "A taxpayer number is ten digits.",
        vatNumber: "A VAT number is eight digits.",
        dayClose: "Choose with the last shift or by hand.",
      },
    });
    expect(checkSettingsChanges(fiscalPage, { deviceId: " 0441-2209 ", whenUnreachable: "Stop selling" })).toEqual({
      ok: true,
      values: { deviceId: "0441-2209", whenUnreachable: "Stop selling" },
    });
  });

  it("says Registered by on the save bar after a registration, and nothing of its own otherwise", () => {
    const now = new Date("2026-10-03T08:00:00Z");
    expect(fiscalPage.lastChangedLine!({ by: "Tendai Mhlanga", at: "2026-03-14T08:20:00Z", what: "registered" }, now)).toBe(
      "Registered by Tendai Mhlanga, 14 March.",
    );
    expect(fiscalPage.lastChangedLine!({ by: "Tendai Mhlanga", at: "2026-03-14T08:20:00Z" }, now)).toBeNull();
  });
});

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

describe("the fiscal device on real rows, against the FDMS test connector", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let fake: ChildProcess;
  let fdmsUrl: string;
  let companyId: string;
  let ownerId: string;
  let siteId: string;
  let registerId: string;
  let productId: string;
  let inventoryItemId: string;
  let saleSeq = 0;
  const savedUrl = process.env.ZIMRA_FDMS_API_BASE_URL;

  const owner = () => ({ companyId, userId: ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });

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

    companyId = (await prisma.company.create({ data: { name: `Mbare Bottle ${stamp}`, slug: `fiscal-${stamp}` } })).id;
    ownerId = (
      await prisma.user.create({
        data: { email: `owner-${stamp}@shop.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId },
      })
    ).id;
    siteId = (await prisma.site.create({ data: { companyId, name: "Mbare", code: `MB-${stamp}` } })).id;
    registerId = (await prisma.retailRegister.create({ data: { companyId, siteId, code: `T-${stamp}`, name: "Front till" } })).id;
    await prisma.companyBranding.create({ data: { companyId, tradingName: "Mbare Bottle" } });
    // What a till sale needs to be signed: a product at 15% VAT, mapped to ZIMRA's tax 1, and a stock row.
    await prisma.taxCode.create({ data: { companyId, code: `VAT15-${stamp}`, name: "Standard VAT", rate: 15, zimraTaxId: 1, appliesTo: "SALES" } });
    productId = (
      await prisma.product.create({
        data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml", standardPrice: 1.15, defaultTaxRate: 15 },
      })
    ).id;
    const location = await prisma.stockLocation.create({ data: { siteId, code: `FLOOR-${stamp}`, name: "Shop floor" } });
    inventoryItemId = (
      await prisma.inventoryItem.create({
        data: { itemCode: `CASTLE-${stamp}`, name: "Castle Lager 340ml", category: "BEVERAGES", unit: "pieces", siteId, locationId: location.id, currentStock: 50, unitCost: 0.8, productId },
      })
    ).id;
  }, 60_000);

  /** A till sale of one Castle at US$1.15 with US$0.15 VAT, posted now and not yet signed. */
  const ringSale = () => {
    saleSeq += 1;
    return prisma.retailSale.create({
      data: {
        companyId,
        siteId,
        saleNo: `RS-${stamp}-${saleSeq}`,
        status: "POSTED",
        postedAt: new Date(),
        subtotal: 1,
        taxAmount: 0.15,
        totalAmount: 1.15,
        lines: {
          create: [
            { companyId, inventoryItemId, productId, itemName: "Castle Lager 340ml", quantity: 1, unitPrice: 1.15, taxAmount: 0.15, lineTotal: 1.15 },
          ],
        },
      },
      select: { id: true },
    });
  };

  afterAll(async () => {
    fake?.kill();
    process.env.ZIMRA_FDMS_API_BASE_URL = savedUrl;
    if (!companyId) return;
    await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
    await prisma.fiscalDay.deleteMany({ where: { companyId } });
    await prisma.fiscalisationProviderConfig.deleteMany({ where: { companyId } });
    await prisma.retailFiscalSettings.deleteMany({ where: { companyId } });
    await prisma.approvalAction.deleteMany({ where: { companyId } });
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.retailSaleLine.deleteMany({ where: { companyId } });
    await prisma.retailSale.deleteMany({ where: { companyId } });
    await prisma.retailShift.deleteMany({ where: { companyId } });
    await prisma.inventoryItem.deleteMany({ where: { siteId } });
    await prisma.stockLocation.deleteMany({ where: { siteId } });
    await prisma.product.deleteMany({ where: { companyId } });
    await prisma.retailRegister.deleteMany({ where: { companyId } });
    await prisma.companyBranding.deleteMany({ where: { companyId } });
    await prisma.accountingSettings.deleteMany({ where: { companyId } });
    await prisma.taxCode.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("opens on no device: not connected, the default rules, no days", async () => {
    const read = await readSettings(companyId, "fiscal", true);
    expect(read?.values).toMatchObject({
      connection: "Not connected yet.",
      connectionState: "NOT_CONNECTED",
      deviceId: "",
      registered: false,
      dayClose: "With the last shift",
      whenUnreachable: "Keep selling, sign later",
      openDay: null,
      days: [],
    });
    await expect(connectFiscalDevice(owner(), "00112233")).rejects.toThrow("Save the device ID before connecting.");
  });

  it("saves the device's numbers to the device, the books and the branding; the rules to their row", async () => {
    const saved = await saveSettings(owner(), "fiscal", {
      deviceId: "0441-2209",
      serialNumber: "HC-FD-88120",
      taxpayerNumber: "2000118844",
      vatNumber: "10023881",
      whenUnreachable: "Stop selling",
    });
    expect(saved).toMatchObject({ ok: true });
    const device = await shopFiscalDevice(companyId);
    expect(device).toMatchObject({ deviceId: "0441-2209", serialNumber: "HC-FD-88120", apiBaseUrl: fdmsUrl, registeredAt: null });
    expect(await prisma.accountingSettings.findUnique({ where: { companyId }, select: { taxNumber: true, vatNumber: true } })).toEqual({
      taxNumber: "2000118844",
      vatNumber: "10023881",
    });
    expect((await prisma.companyBranding.findUnique({ where: { companyId } }))?.vatNumber).toBe("10023881");
    expect(await prisma.retailFiscalSettings.findUnique({ where: { companyId } })).toMatchObject({
      dayClose: "WITH_LAST_SHIFT",
      whenUnreachable: "STOP_SELLING",
      updatedById: ownerId,
    });
    // Not connected, so nothing stops a sale and the tills know no device.
    expect(await fiscalSaleRefusal(companyId)).toBeNull();
    expect(await tillFiscal(companyId)).toEqual({ deviceId: null, dayNo: null, whenUnreachable: "STOP_SELLING" });
  });

  it("connects with ZIMRA's activation key: registered by the owner, the key kept with ZIMRA's certificate", async () => {
    await connectFiscalDevice(owner(), "00112233");
    const device = await shopFiscalDevice(companyId);
    expect(device?.registeredById).toBe(ownerId);
    expect(device?.registeredAt).toBeInstanceOf(Date);
    expect(device?.lastOkAt).toBeInstanceOf(Date);
    const bundle = JSON.parse(device!.certificateRef!) as { cert: string; key: string };
    expect(bundle.cert).toMatch(/BEGIN CERTIFICATE/);
    expect(bundle.key).toMatch(/PRIVATE KEY/);
    const event = await prisma.platformAuditEvent.findFirst({
      where: { companyId, eventType: "RETAIL_FISCAL.CONNECTED", entityId: "fiscal" },
      select: { payloadJson: true },
    });
    expect(event?.payloadJson).toContain("0441-2209");
    expect(event?.payloadJson).not.toMatch(/00112233|PRIVATE KEY/);

    const read = await readSettings(companyId, "fiscal", true);
    expect(read?.values).toMatchObject({ registered: true, connection: "Connected to ZIMRA. No fiscal day open." });
    expect(read?.lastChanged).toMatchObject({ by: "Tendai Mhlanga", what: "registered" });
  });

  it("tests a receipt: signed with the device's key, checked against its certificate, and ZIMRA answers", async () => {
    let tick = 0;
    const result = await testFiscalDevice(companyId, () => (tick += 140));
    expect(result).toEqual({ ok: true, message: "The device signed a test receipt and ZIMRA answered.", ms: 140 });
    // Nothing submitted, no number used.
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(0);
  });

  it("opens the day with the first shift, and the tills sign in it", async () => {
    expect(await openFiscalDayIfNone(owner())).toEqual({ opened: 1 });
    expect(await openFiscalDayIfNone(owner())).toEqual({ opened: null });
    expect(await tillFiscal(companyId)).toEqual({ deviceId: "0441-2209", dayNo: 1, whenUnreachable: "STOP_SELLING" });
    const read = await readSettings(companyId, "fiscal", true);
    expect(read?.values).toMatchObject({ connection: expect.stringMatching(/^Connected to ZIMRA\. Day 1 open since \d\d:\d\d\.$/) });
  });

  it("refuses to connect the device again while its day is open: the day's report is signed under the key it has", async () => {
    const before = (await shopFiscalDevice(companyId))!;
    await expect(connectFiscalDevice(owner(), "00112244")).rejects.toMatchObject({
      status: 409,
      code: "FISCAL_DAY_OPEN",
      message: "Close the fiscal day before connecting the device again.",
    });
    const after = (await shopFiscalDevice(companyId))!;
    expect(after.certificateRef).toBe(before.certificateRef);
    expect(after.registeredAt).toEqual(before.registeredAt);
  });

  it("refuses a new device ID while a day is open on this one", async () => {
    await expect(saveSettings(owner(), "fiscal", { deviceId: "0441-9999" })).rejects.toMatchObject({
      message: "Close the fiscal day before changing the device.",
      refusal: { status: 409, code: "FISCAL_DAY_OPEN" },
    });
    expect((await shopFiscalDevice(companyId))?.deviceId).toBe("0441-2209");
  });

  it("stops selling from ZIMRA's first silence until it answers, asking it again every five minutes", async () => {
    const device = (await shopFiscalDevice(companyId))!;
    // In the past, so what the later tests note at the real time reads newer.
    const failed = new Date(Date.now() - 20 * 60_000);
    await prisma.fiscalisationProviderConfig.update({ where: { id: device.id }, data: { lastOkAt: new Date(failed.getTime() - 60_000), lastFailedAt: failed } });
    const refusal = "ZIMRA cannot be reached, and this shop stops selling until it answers. Try again in a few minutes.";
    expect(await fiscalSaleRefusal(companyId, new Date(failed.getTime() + 60_000))).toBe(refusal);
    expect((await readSettings(companyId, "fiscal", true))?.values).toMatchObject({ connectionState: "UNREACHABLE" });

    // Five minutes on, still silent: the sale asks ZIMRA, meets silence, and the wait starts again.
    await prisma.fiscalisationProviderConfig.update({ where: { id: device.id }, data: { apiBaseUrl: "http://127.0.0.1:9" } });
    const later = new Date(failed.getTime() + 6 * 60_000);
    expect(await fiscalSaleRefusal(companyId, later)).toBe(refusal);
    expect((await shopFiscalDevice(companyId))?.lastFailedAt).toEqual(later);
    expect(await fiscalSaleRefusal(companyId, new Date(later.getTime() + 60_000))).toBe(refusal);

    // ZIMRA is back: the next ask five minutes on finds it, and the tills sell again.
    await prisma.fiscalisationProviderConfig.update({ where: { id: device.id }, data: { apiBaseUrl: fdmsUrl } });
    const back = new Date(later.getTime() + 6 * 60_000);
    expect(await fiscalSaleRefusal(companyId, back)).toBeNull();
    expect((await shopFiscalDevice(companyId))?.lastOkAt).toEqual(back);
    expect(await fiscalSaleRefusal(companyId)).toBeNull();
  });

  it("closes the day by hand: its report to ZIMRA, the day closed with what it took", async () => {
    const day = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    const sale = await prisma.retailSale.create({
      data: { companyId, siteId, saleNo: `RS-${stamp}`, totalAmount: 8.7, status: "POSTED", postedAt: new Date() },
    });
    await prisma.fiscalReceipt.create({
      data: {
        companyId,
        retailSaleId: sale.id,
        status: "SUCCESS",
        providerKey: "ZIMRA_FDMS",
        receiptCounter: 1,
        receiptGlobalNo: 1,
        fiscalDayId: day.id,
        receiptType: "FISCALINVOICE",
        receiptCurrency: "USD",
      },
    });
    // The numbers it holds, counted on the day as the signer would have.
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { lastReceiptCounter: 1, lastReceiptGlobalNo: 1 } });
    const read = await readSettings(companyId, "fiscal", true);
    expect((read?.values.days as Array<{ label: string; total: string }>)[0]).toEqual({ no: 1, label: "Today, open", total: "US$8.70" });

    await closeShopFiscalDay(owner(), day.id);
    const closed = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closingSignature).toBeTruthy();
    const after = await readSettings(companyId, "fiscal", true);
    expect(after?.values).toMatchObject({ openDay: null, connection: "Connected to ZIMRA. No fiscal day open." });
    expect((after?.values.days as Array<{ label: string; total: string }>)[0]).toEqual({
      no: 1,
      label: expect.stringMatching(/^\d{1,2} \w{3}, closed \d\d:\d\d$/),
      total: "US$8.70",
    });
    expect(
      await prisma.platformAuditEvent.count({ where: { companyId, eventType: "RETAIL_FISCAL.DAY_CLOSED", entityId: "fiscal" } }),
    ).toBe(1);
    await expect(closeShopFiscalDay(owner(), day.id)).rejects.toMatchObject({ status: 409, message: "Day 1 is already closed." });
  });

  it("closes the day with the last shift, not before, and never by hand", async () => {
    await openFiscalDayIfNone(owner());
    const shift = (n: number) =>
      prisma.retailShift.create({
        data: {
          companyId,
          shiftNo: `SH-${stamp}-${n}`,
          registerCode: `T-${stamp}`,
          registerName: "Front till",
          registerId,
          siteId,
          cashierId: ownerId,
          cashierName: "Tendai Mhlanga",
        },
      });
    const first = await shift(1);
    const second = await shift(2);
    await closeRetailShiftTransaction({ actor: owner(), shiftId: first.id, countedCash: 0 });
    expect(await prisma.fiscalDay.findFirst({ where: { companyId, fiscalDayNo: 2 }, select: { status: true } })).toEqual({ status: "OPENED" });

    // By hand: the last shift closing leaves the day open.
    await prisma.retailFiscalSettings.update({ where: { companyId }, data: { dayClose: "BY_HAND" } });
    expect(await closeFiscalDayIfLastShift(owner())).toEqual({ closed: null });
    await prisma.retailFiscalSettings.update({ where: { companyId }, data: { dayClose: "WITH_LAST_SHIFT" } });

    await closeRetailShiftTransaction({ actor: owner(), shiftId: second.id, countedCash: 0 });
    expect(await prisma.fiscalDay.findFirst({ where: { companyId, fiscalDayNo: 2 }, select: { status: true } })).toEqual({ status: "CLOSED" });
    const event = await prisma.platformAuditEvent.findFirst({
      where: { companyId, eventType: "RETAIL_FISCAL.DAY_CLOSED" },
      orderBy: { createdAt: "desc" },
      select: { payloadJson: true },
    });
    expect(event?.payloadJson).toContain('"how":"LAST_SHIFT"');
  });

  it("leaves a day closing when ZIMRA does not answer, and sends it again", async () => {
    await openFiscalDayIfNone(owner());
    const day = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    const device = (await shopFiscalDevice(companyId))!;
    await prisma.fiscalisationProviderConfig.update({ where: { id: device.id }, data: { apiBaseUrl: "http://127.0.0.1:9" } });
    const refused = await closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(FiscalRefused);
    expect(refused).toMatchObject({ status: 502, message: expect.stringContaining("ZIMRA did not answer") });
    expect((await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } })).status).toBe("CLOSING");
    expect((await shopFiscalDevice(companyId))?.lastFailedAt).toBeInstanceOf(Date);
    expect((await readSettings(companyId, "fiscal", true))?.values).toMatchObject({
      connectionState: "UNREACHABLE",
      openDay: { no: 3, status: "CLOSING" },
    });

    await prisma.fiscalisationProviderConfig.update({ where: { id: device.id }, data: { apiBaseUrl: fdmsUrl } });
    await closeShopFiscalDay(owner(), day.id);
    expect((await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } })).status).toBe("CLOSED");
  });

  it("signs later: a till receipt ZIMRA did not take goes again when the day closes", async () => {
    await openFiscalDayIfNone(owner());
    const day = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    const device = (await shopFiscalDevice(companyId))!;
    await prisma.fiscalisationProviderConfig.update({ where: { id: device.id }, data: { apiBaseUrl: "http://127.0.0.1:9" } });
    const sale = await ringSale();
    expect(await fiscaliseRetailSale({ companyId, saleId: sale.id })).toMatchObject({ fiscalStatus: "FAILED" });
    const receipt = await prisma.fiscalReceipt.findUniqueOrThrow({ where: { retailSaleId: sale.id } });
    expect(receipt).toMatchObject({ status: "FAILED", fiscalDayId: day.id });

    // Still away: it goes again, ZIMRA does not answer, and the day says so.
    await expect(closeShopFiscalDay(owner(), day.id)).rejects.toMatchObject({
      status: 409,
      message: `Day ${day.fiscalDayNo} has 1 receipt ZIMRA has not taken yet. It was sent again just now and ZIMRA did not answer. Close the day again once ZIMRA is back.`,
    });

    // Back: closing sends it first, the same signed receipt, then the report.
    await prisma.fiscalisationProviderConfig.update({ where: { id: device.id }, data: { apiBaseUrl: fdmsUrl } });
    await closeShopFiscalDay(owner(), day.id);
    expect(await prisma.fiscalReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({
      status: "SUCCESS",
      receiptGlobalNo: receipt.receiptGlobalNo,
      receiptHash: receipt.receiptHash,
    });
    expect((await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } })).status).toBe("CLOSED");
  });

  it("closes yesterday's day with the morning's first shift when the last shift could not, and opens today's", async () => {
    await openFiscalDayIfNone(owner());
    const stale = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    await prisma.fiscalDay.update({ where: { id: stale.id }, data: { openedAt: new Date(Date.now() - 26 * 3_600_000) } });
    expect(await openFiscalDayIfNone(owner())).toEqual({ opened: stale.fiscalDayNo + 1 });
    expect((await prisma.fiscalDay.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("CLOSED");
  });

  it("opens a day for a sale that finds none, and signs in it what was sold while none was open", async () => {
    const open = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    await closeShopFiscalDay(owner(), open.id);
    // Rung while no day was open (its report was waiting on ZIMRA): no receipt.
    const sale = await ringSale();
    expect(await openFiscalDayIfNone(owner())).toEqual({ opened: open.fiscalDayNo + 1 });
    const today = (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
    expect(await prisma.fiscalReceipt.findUnique({ where: { retailSaleId: sale.id } })).toMatchObject({
      status: "SUCCESS",
      fiscalDayId: today.id,
    });
    await closeShopFiscalDay(owner(), today.id);
  });

  it("starts a new device afresh when the device ID changes with no day open, retiring the old one with its days", async () => {
    const old = (await shopFiscalDevice(companyId))!;
    await saveSettings(owner(), "fiscal", { deviceId: "0441-3000" });
    const device = await shopFiscalDevice(companyId);
    expect(device).toMatchObject({ deviceId: "0441-3000", registeredAt: null, certificateRef: null, isActive: true });
    expect(device!.id).not.toBe(old.id);
    expect(await prisma.fiscalisationProviderConfig.findUnique({ where: { id: old.id } })).toMatchObject({
      providerKey: `ZIMRA_FDMS#${old.id}`,
      isActive: false,
      deviceId: "0441-2209",
    });
    const oldReceipts = await prisma.fiscalReceipt.count({ where: { companyId, fiscalDay: { providerConfigId: old.id } } });
    expect(oldReceipts).toBeGreaterThan(0);
    expect(await prisma.fiscalReceipt.count({ where: { companyId, providerKey: `ZIMRA_FDMS#${old.id}` } })).toBe(oldReceipts);
    expect((await readSettings(companyId, "fiscal", true))?.values).toMatchObject({
      registered: false,
      connection: "Not connected yet.",
      days: [],
    });
    // Its number change before it ever had a day is a plain edit.
    await saveSettings(owner(), "fiscal", { deviceId: "0441-3001" });
    expect((await shopFiscalDevice(companyId))!.id).toBe(device!.id);
  });
});
