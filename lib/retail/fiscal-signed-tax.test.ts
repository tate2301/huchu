/**
 * A till receipt keeps the tax it was signed with (SET-08), on real rows
 * against the FDMS test connector (`scripts/fake-fdms.mjs`).
 *
 * The owner re-rates a product while its sales are in an open day: a receipt
 * ZIMRA took still counts in the day's Z-report at the rate it was signed
 * with, and a receipt signed while ZIMRA was away is still sent, the same
 * signed bytes, once ZIMRA is back. A receipt that cannot be sent for a reason
 * of its own makes the close say so, not blame ZIMRA.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  assignRetailSaleFiscalDay,
  fiscaliseRetailSale,
  retailFiscalDayTaxLines,
  shopFiscalDevice,
} from "@/lib/retail/fiscalisation";
import { saveSettings } from "@/lib/retail/settings";

import { closeShopFiscalDay, connectFiscalDevice, FiscalRefused, openFiscalDayIfNone } from "./fiscal-settings";

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

describe("a till receipt keeps the tax it was signed with", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let fake: ChildProcess;
  let fdmsUrl: string;
  let companyId: string;
  let ownerId: string;
  let siteId: string;
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

    companyId = (await prisma.company.create({ data: { name: `Signed Tax ${stamp}`, slug: `signed-tax-${stamp}` } })).id;
    ownerId = (
      await prisma.user.create({ data: { email: `owner-tax-${stamp}@shop.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId } })
    ).id;
    siteId = (await prisma.site.create({ data: { companyId, name: "Mbare", code: `MBR-${stamp}` } })).id;
    await prisma.companyBranding.create({ data: { companyId, tradingName: "Signed Tax" } });
    await prisma.taxCode.create({ data: { companyId, code: `VAT15-${stamp}`, name: "Standard VAT", rate: 15, zimraTaxId: 1, appliesTo: "SALES" } });
    await prisma.taxCode.create({ data: { companyId, code: `ZERO-${stamp}`, name: "Zero rated", rate: 0, zimraTaxId: 2, appliesTo: "SALES" } });
    productId = (
      await prisma.product.create({ data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml", standardPrice: 1.15, defaultTaxRate: 15 } })
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
    await saveSettings(owner(), "fiscal", {
      deviceId: "0441-7777",
      serialNumber: "HC-FD-77770",
      taxpayerNumber: "2000118844",
      vatNumber: "10023881",
      dayClose: "By hand",
    });
    await connectFiscalDevice(owner(), "00112233");
  });

  afterAll(async () => {
    fake?.kill();
    process.env.ZIMRA_FDMS_API_BASE_URL = savedUrl;
    if (!companyId) return;
    await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
    await prisma.fiscalDay.deleteMany({ where: { companyId } });
    await prisma.fiscalisationProviderConfig.deleteMany({ where: { companyId } });
    await prisma.retailFiscalSettings.deleteMany({ where: { companyId } });
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.retailMessage.deleteMany({ where: { companyId } });
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

  /** Where the device's calls go; ZIMRA answered last. */
  const via = async (url: string) => {
    const device = (await shopFiscalDevice(companyId))!;
    await prisma.fiscalisationProviderConfig.update({ where: { id: device.id }, data: { apiBaseUrl: url, lastFailedAt: null, lastOkAt: new Date() } });
  };
  const rate = (defaultTaxRate: number) => prisma.product.update({ where: { id: productId }, data: { defaultTaxRate } });
  const openDay = async () => {
    await openFiscalDayIfNone(companyId);
    return (await prisma.fiscalDay.findFirst({ where: { companyId, status: "OPENED" } }))!;
  };
  /** One Castle at US$1.15 with US$0.15 VAT, its day settled in its commit, then sent. */
  const tillSale = async () => {
    const sale = await prisma.$transaction(async (tx) => {
      saleSeq += 1;
      const created = await tx.retailSale.create({
        data: {
          companyId,
          siteId,
          saleNo: `RC-${stamp}-${saleSeq}`,
          status: "POSTED",
          postedAt: new Date(),
          subtotal: 1,
          taxAmount: 0.15,
          totalAmount: 1.15,
          lines: {
            create: [{ companyId, inventoryItemId, productId, itemName: "Castle Lager 340ml", quantity: 1, unitPrice: 1.15, taxAmount: 0.15, lineTotal: 1.15 }],
          },
        },
        select: { id: true, saleNo: true },
      });
      return { ...created, assigned: await assignRetailSaleFiscalDay(tx, { companyId, saleId: created.id }) };
    });
    return { sale, outcome: await fiscaliseRetailSale({ companyId, saleId: sale.id, assigned: sale.assigned, holdWhileUnreachable: true }) };
  };
  const counters = async (dayId: string) => {
    const day = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: dayId } });
    return { status: day.status, report: JSON.parse(day.countersJson ?? "{}") };
  };

  beforeEach(async () => {
    await via(fdmsUrl);
    await rate(15);
    const open = await prisma.fiscalDay.findFirst({ where: { companyId, status: { not: "CLOSED" } } });
    if (open) await closeShopFiscalDay(owner(), open.id);
  });

  it("counts receipts ZIMRA took at the rate they were signed with after the product is re-rated", async () => {
    const day = await openDay();
    const first = await tillSale();
    const second = await tillSale();
    expect([first.outcome.fiscalStatus, second.outcome.fiscalStatus]).toEqual(["SUCCESS", "SUCCESS"]);

    await rate(0);
    const lines = await retailFiscalDayTaxLines({ companyId, fiscalDayId: day.id });
    expect(Object.keys(lines)).toHaveLength(2);
    expect(Object.values(lines).flat()).toEqual([
      { taxId: 1, taxPercent: "15.00", taxAmountCents: BigInt(15), salesAmountCents: BigInt(115) },
      { taxId: 1, taxPercent: "15.00", taxAmountCents: BigInt(15), salesAmountCents: BigInt(115) },
    ]);

    await closeShopFiscalDay(owner(), day.id);
    const { status, report } = await counters(day.id);
    expect(status).toBe("CLOSED");
    expect(report.receiptCount).toBe(2);
    expect(report.receiptsWithoutTaxLines).toEqual([]);
    expect(report.counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fiscalCounterType: "SaleByTax", fiscalCounterTaxID: 1, fiscalCounterValueCents: "230" }),
        expect.objectContaining({ fiscalCounterType: "SaleTaxByTax", fiscalCounterTaxID: 1, fiscalCounterValueCents: "30" }),
      ]),
    );
  });

  it("sends a receipt signed while ZIMRA was away once it is back, after the product is re-rated, and the day closes", async () => {
    const day = await openDay();
    await via("http://127.0.0.1:9");
    const { sale, outcome } = await tillSale();
    expect(outcome.fiscalReceiptId).toBeTruthy();
    expect(outcome.fiscalStatus).not.toBe("SUCCESS");

    await via(fdmsUrl);
    await rate(0);
    const again = await fiscaliseRetailSale({ companyId, saleId: sale.id });
    expect(again).toMatchObject({ fiscalStatus: "SUCCESS", fiscalReceiptId: outcome.fiscalReceiptId });

    await closeShopFiscalDay(owner(), day.id);
    const { status, report } = await counters(day.id);
    expect(status).toBe("CLOSED");
    expect(report.receiptsWithoutTaxLines).toEqual([]);
    expect(report.counters).toEqual(
      expect.arrayContaining([expect.objectContaining({ fiscalCounterType: "SaleTaxByTax", fiscalCounterTaxID: 1, fiscalCounterValueCents: "15" })]),
    );
  });

  it("names the receipt, not ZIMRA, when a signed receipt cannot be sent for a reason of its own", async () => {
    const day = await openDay();
    await via("http://127.0.0.1:9");
    const { sale } = await tillSale();
    await via(fdmsUrl);
    // The sale's total is edited after its receipt was signed: that receipt can no longer be sent under its signature.
    await prisma.retailSale.update({ where: { id: sale.id }, data: { totalAmount: 2.3 } });

    const refusal = await closeShopFiscalDay(owner(), day.id).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(FiscalRefused);
    expect((refusal as FiscalRefused).status).toBe(409);
    expect((refusal as FiscalRefused).code).toBe("FISCAL_RECEIPT_ALTERED");
    expect((refusal as FiscalRefused).message).toContain(`the receipt for sale ${sale.saleNo} was not sent to ZIMRA`);
    expect((refusal as FiscalRefused).message).not.toContain("ZIMRA did not answer");
    expect((await counters(day.id)).status).toBe("OPENED");

    // Put back, so the next close can send it.
    await prisma.retailSale.update({ where: { id: sale.id }, data: { totalAmount: 1.15 } });
  });
});
