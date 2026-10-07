import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { shiftOpenedSentence, tillWords } from "@/lib/retail/shift-open-rules";

import { openingDefaults, openShift, ShiftRefused } from "./shifts";

/**
 * Opening a shift (50-floor W-37, FLR-03): who may open one for whom, the
 * till and cashier already busy, the ZiG float at the day's rate, two openings
 * of one till at once, and the journal the float posts. Against the test
 * database.
 */

let shop: TestShop;
let front: string;
let back: string;
let handheld: string;
const people: Record<string, { id: string; name: string; role: string }> = {};

const sessionOf = (who: string) => ({
  user: { id: people[who]!.id, companyId: shop.companyId, role: people[who]!.role, name: people[who]!.name },
});

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof ShiftRefused ? { status: error.status, error: error.message, field: error.field } : error),
  );

beforeAll(async () => {
  shop = await makeTestShop("Shift floor");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  const till = async (code: string, name: string) =>
    (await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId: shop.mainId, code: `${code}-${shop.companyId.slice(0, 6)}`, name }, select: { id: true } })).id;
  front = await till("FRONT", "Front till");
  back = await till("BACK", "Back till");
  handheld = await till("HAND", "Handheld 1");
  people.manager = { id: shop.managerId, name: "Tafara Nyathi", role: "MANAGER" };
  for (const [key, name, role] of [
    ["kuda", "Kuda Banda", "CASHIER"],
    ["farai", "Farai Moyo", "CASHIER"],
    ["chipo", "Chipo Dube", "CASHIER"],
    ["clerk", "Tendai Sibanda", "STOCK_CLERK"],
  ] as const) {
    const user = await prisma.user.create({
      data: { companyId: shop.companyId, name, role, email: `${key}-${shop.companyId}@shift-floor.test` },
      select: { id: true },
    });
    people[key] = { id: user.id, name, role };
  }
  await prisma.retailPaymentSettings.create({ data: { companyId: shop.companyId, takeCashZig: true } });
  await prisma.currencyRate.create({
    data: { companyId: shop.companyId, baseCurrency: "USD", quoteCurrency: "ZWG", rate: 26.8, effectiveDate: new Date(Date.now() - 60_000) },
  });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

const close = (id: string) => prisma.retailShift.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });

describe("who may open a shift for whom", () => {
  it("lets a manager open the back till for Kuda Banda, numbered company-wide", async () => {
    const { shift } = await openShift({ session: sessionOf("manager"), registerId: back, cashierId: people.kuda!.id, openingFloat: "100.00" });
    expect(shift).toMatchObject({ registerName: "Back till", cashierName: "Kuda Banda", status: "OPEN", siteId: shop.mainId });
    expect(shift.shiftNo).toMatch(/^SH-\d{5}$/);
    expect(Number(shift.expectedCash)).toBe(100);
    expect(shiftOpenedSentence(shift)).toBe(`${shift.shiftNo} open on the back till for Kuda Banda.`);
    const opened = await prisma.platformAuditEvent.findFirst({ where: { companyId: shop.companyId, entityId: shift.id, eventType: "RETAIL_SHIFT.OPENED" } });
    expect(opened?.actor).toBeTruthy();
    expect(JSON.parse(opened!.payloadJson!)).toMatchObject({ cashierId: people.kuda!.id, openingFloat: "100.00", openingFloatZig: "0.00" });
    await close(shift.id);
  });

  it("refuses a cashier opening one for somebody else, in the matrix's words", async () => {
    expect(await refusal(openShift({ session: sessionOf("chipo"), registerId: back, cashierId: people.farai!.id, openingFloat: "100.00" }))).toEqual({
      status: 403,
      error: "Your role cannot open a till shift in shifts and cash",
      field: undefined,
    });
  });

  it("refuses a person who cannot sell, under Cashier", async () => {
    expect(await refusal(openShift({ session: sessionOf("manager"), registerId: back, cashierId: people.clerk!.id, openingFloat: "0" }))).toEqual({
      status: 400,
      error: "Tendai Sibanda cannot sell at a till.",
      field: "who",
    });
  });

  it("refuses a till that has an open shift, and a cashier who has one elsewhere", async () => {
    const { shift } = await openShift({ session: sessionOf("manager"), registerId: back, cashierId: people.farai!.id, openingFloat: "100.00" });
    expect(await refusal(openShift({ session: sessionOf("manager"), registerId: back, cashierId: people.kuda!.id, openingFloat: "100.00" }))).toEqual({
      status: 409,
      error: "Back till already has an open shift.",
      field: undefined,
    });
    expect(await refusal(openShift({ session: sessionOf("manager"), registerId: front, cashierId: people.farai!.id, openingFloat: "100.00" }))).toEqual({
      status: 409,
      error: "Farai Moyo already has a shift open on the back till.",
      field: undefined,
    });
    await close(shift.id);
  });

  it("refuses a float that is not an amount, and a till of another shop", async () => {
    expect(await refusal(openShift({ session: sessionOf("manager"), registerId: front, cashierId: people.kuda!.id, openingFloat: "1.234" }))).toEqual({
      status: 400,
      error: "Give the float as an amount, like 100.00.",
      field: "float",
    });
    expect(
      await refusal(openShift({ session: sessionOf("manager"), registerId: "00000000-0000-4000-8000-000000000000", cashierId: people.kuda!.id, openingFloat: "0" })),
    ).toEqual({ status: 404, error: "Till not found", field: "till" });
  });
});

describe("the floats and the books", () => {
  it("adds ZiG 500.00 at 26.80 as US$18.66, and the journal debits each drawer by its part", async () => {
    const { shift, zigBase } = await openShift({
      session: sessionOf("manager"),
      registerId: front,
      cashierId: people.chipo!.id,
      openingFloat: "100.00",
      openingFloatZig: "500.00",
    });
    expect(zigBase.toFixed(2)).toBe("18.66");
    expect(Number(shift.openingFloatZig)).toBe(500);
    expect(Number(shift.expectedCash)).toBe(118.66);

    await runRetailPosting(shop.companyId, "BY_HAND", null);
    const [entry] = await prisma.journalEntry.findMany({
      where: { companyId: shop.companyId, sourceType: "RETAIL_SHIFT_OPEN", sourceId: shift.id },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
    expect(entry).toBeDefined();
    const sides = entry!.lines.map((line) => ({ code: line.account.code, debit: line.debit, credit: line.credit })).sort((a, b) => a.code.localeCompare(b.code));
    expect(sides).toEqual([
      { code: "1000", debit: 100, credit: 0 },
      { code: "1001", debit: 18.66, credit: 0 },
      { code: "1005", debit: 0, credit: 118.66 },
    ]);
    await close(shift.id);
  });

  it("takes the default float from the till's last close", async () => {
    expect(await openingDefaults(shop.companyId, handheld)).toEqual({ float: "", hint: "Counted in.", takesZig: true, zigFloat: "0.00" });
    await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: `SH-OLD-${shop.companyId.slice(0, 6)}`,
        registerId: handheld,
        registerCode: "HAND",
        registerName: "Handheld 1",
        siteId: shop.mainId,
        cashierId: people.kuda!.id,
        cashierName: "Kuda Banda",
        status: "CLOSED",
        closedAt: new Date(),
        floatLeft: "100.00",
      },
    });
    expect(await openingDefaults(shop.companyId, handheld)).toMatchObject({ float: "100.00", hint: "Counted in. Last close left US$100.00." });
  });

  it("opens one of two openings of one till at once and refuses the other", async () => {
    const results = await Promise.allSettled([
      openShift({ session: sessionOf("manager"), registerId: handheld, cashierId: people.kuda!.id, openingFloat: "0" }),
      openShift({ session: sessionOf("manager"), registerId: handheld, cashierId: people.farai!.id, openingFloat: "0" }),
    ]);
    const opened = results.filter((result) => result.status === "fulfilled");
    const refused = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(opened).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]!.reason).toBeInstanceOf(ShiftRefused);
    expect((refused[0]!.reason as ShiftRefused).message).toBe("Handheld 1 already has an open shift.");
    expect(await prisma.retailShift.count({ where: { companyId: shop.companyId, registerId: handheld, status: "OPEN" } })).toBe(1);
  });
});

describe("the words", () => {
  it("says the till the way people do", () => {
    expect(tillWords("Back till")).toBe("the back till");
    expect(tillWords("Handheld 1")).toBe("Handheld 1");
  });
});
