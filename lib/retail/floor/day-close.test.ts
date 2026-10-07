import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { FISCAL_PROVIDER_KEY } from "@/lib/retail/fiscalisation";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { tradingDayKey } from "@/lib/retail/z-report";
import { generateRetailZReportTransaction } from "@/lib/retail/z-report-generate";

/**
 * Closing a site's day (50-floor W-43, FLR-07), as the browser calls it:
 * who may, the refusals (an open drawer, a difference not signed off or only
 * looked into, a bad amount, a day not come yet), the close happening once
 * even when two managers press together, each till's Z-report taken and the
 * same as the generator's, the cash banked to the bank register and the books
 * (Dr 1010 / Cr 1005) under one source, the fiscal day closed by hand only
 * when no drawer is open anywhere, and the figures frozen against a later
 * void. Against the test database, with only the sign-in and ZIMRA faked.
 */

const { validateSessionMock, closeFiscalMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn(), closeFiscalMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

vi.mock("@/lib/retail/fiscal-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/retail/fiscal-settings")>()),
  closeShopFiscalDay: closeFiscalMock,
}));

import { GET as dayGet } from "@/app/api/v2/retail/end-of-day/route";
import { POST as closePost } from "@/app/api/v2/retail/end-of-day/close/route";
import { GET as listGet } from "@/app/api/v2/reports/[key]/route";

let shop: TestShop;
const tills: Record<"front" | "back" | "borr", { id: string; code: string; name: string; siteId: string }> = {} as never;
const people: Record<string, { id: string; name: string; role: string }> = {};
let bankId = "";
let seq = 0;

const daysAgo = (n: number) => tradingDayKey(new Date(Date.now() - n * 86_400_000));

function as(who: string) {
  const person = people[who]!;
  validateSessionMock.mockResolvedValue({
    session: { user: { id: person.id, companyId: shop.companyId, role: person.role, name: person.name, email: `${who}@day-close.test`, enabledFeatures: ["retail.core", "retail.shifts"] } },
  });
}

async function view(date: string, siteId = shop.mainId) {
  const response = await dayGet(new NextRequest(`http://hurudza.test/api/v2/retail/end-of-day?siteId=${siteId}&date=${date}`));
  return { status: response.status, body: await response.json() };
}

async function close(date: string, banked = "0", siteId = shop.mainId) {
  const response = await closePost(
    new NextRequest("http://hurudza.test/api/v2/retail/end-of-day/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId, date, banked }),
    }),
  );
  return { status: response.status, body: await response.json() };
}

/** A drawer opened at 08:00 on `date`: closed with `variance` (null: no count), or still open. */
async function drawer(date: string, till: keyof typeof tills, options: { open?: boolean; variance?: string | null; signOff?: "ACCEPT" | "LOOK_INTO" } = {}) {
  seq += 1;
  const own = tills[till];
  const variance = options.variance === undefined ? "0.00" : options.variance;
  return prisma.retailShift.create({
    data: {
      companyId: shop.companyId,
      shiftNo: `SH-${90000 + seq}-${shop.companyId.slice(0, 4)}`,
      registerId: own.id,
      registerCode: own.code,
      registerName: own.name,
      siteId: own.siteId,
      cashierId: people.chipo!.id,
      cashierName: "Chipo Dube",
      openingFloat: "100.00",
      expectedCash: "100.00",
      status: options.open ? "OPEN" : "CLOSED",
      openedAt: new Date(`${date}T08:00:00.000Z`),
      ...(options.open
        ? {}
        : {
            closedAt: new Date(`${date}T19:58:00.000Z`),
            countedCash: variance === null ? null : (100 + Number(variance)).toFixed(2),
            variance,
            signOffOutcome: options.signOff ?? null,
            signedOffAt: options.signOff ? new Date() : null,
          }),
    },
  });
}

/** A document on a drawer: a sale (positive), a refund or void (negative), paid as given. */
async function sale(shift: { id: string; registerId: string; siteId: string; openedAt: Date }, total: string, payments: Array<{ tender: "CASH" | "ECOCASH" | "CARD"; amount: string; currency?: string }>, saleType: "SALE" | "REFUND" | "VOID" = "SALE", at?: Date) {
  seq += 1;
  return prisma.retailSale.create({
    data: {
      companyId: shop.companyId,
      saleNo: `S-${90000 + seq}-${shop.companyId.slice(0, 4)}`,
      siteId: shift.siteId,
      registerId: shift.registerId,
      shiftId: shift.id,
      cashierId: people.chipo!.id,
      saleType,
      status: "POSTED",
      subtotal: total,
      totalAmount: total,
      baseAmount: total,
      tenderedAmount: saleType === "SALE" ? total : null,
      postedAt: at ?? new Date(shift.openedAt.getTime() + 3600_000),
      payments: { create: payments.map((payment) => ({ companyId: shop.companyId, tenderType: payment.tender, amount: payment.amount, baseAmount: payment.amount, currency: payment.currency ?? "USD" })) },
    },
  });
}

async function bankedJournal(sourceId: string) {
  await runRetailPosting(shop.companyId, "BY_HAND", null);
  const entries = await prisma.journalEntry.findMany({
    where: { companyId: shop.companyId, sourceType: "RETAIL_DAY_BANKED", sourceId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  return entries.map((entry) => entry.lines.map((line) => ({ code: line.account.code, debit: Number(line.debit), credit: Number(line.credit) })).sort((a, b) => a.code.localeCompare(b.code)));
}

beforeAll(async () => {
  shop = await makeTestShop("Day close", { twoSites: true });
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  const stamp = shop.companyId.slice(0, 6);
  for (const [key, code, name, siteId] of [
    ["front", `FRONT-${stamp}`, "Front till", shop.mainId],
    ["back", `BACK-${stamp}`, "Back till", shop.mainId],
    ["borr", `BORR-${stamp}`, "Borrowdale till", shop.secondId!],
  ] as const) {
    const register = await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId, code, name }, select: { id: true } });
    tills[key] = { id: register.id, code, name, siteId };
  }
  people.owner = { id: shop.ownerId, name: "Tendai Mhlanga", role: "SUPERADMIN" };
  people.manager = { id: shop.managerId, name: "Tafara Nyathi", role: "MANAGER" };
  for (const [key, name, role] of [
    ["chipo", "Chipo Dube", "CASHIER"],
    ["books", "Ruvimbo Chari", "FINANCE_OFFICER"],
  ] as const) {
    const user = await prisma.user.create({ data: { companyId: shop.companyId, name, role, email: `${key}-${shop.companyId}@day-close.test` }, select: { id: true } });
    people[key] = { id: user.id, name, role };
  }
  bankId = (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name: "CBZ current account", bankName: "CBZ", currency: "USD" }, select: { id: true } })).id;
  await prisma.accountingSettings.upsert({
    where: { companyId: shop.companyId },
    update: { defaultBankAccountId: bankId },
    create: { companyId: shop.companyId, defaultBankAccountId: bankId },
  });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.bankTransaction.deleteMany({ where: { companyId } });
  await prisma.retailDayClose.deleteMany({ where: { companyId } });
  await prisma.retailZReport.deleteMany({ where: { companyId } });
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.fiscalDay.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
}, 60_000);

describe("who may close the day", () => {
  it("refuses the cashier the page, the close and Past days; the bookkeeper reads both pages but cannot close", async () => {
    const date = daysAgo(20);
    await drawer(date, "front");
    as("chipo");
    expect(await view(date)).toMatchObject({ status: 403, body: { error: "Your role cannot view the end of day" } });
    expect((await close(date)).status).toBe(403);
    const list = await listGet(new NextRequest("http://hurudza.test/api/v2/reports/retail-days?page=1"), { params: Promise.resolve({ key: "retail-days" }) });
    expect(list.status).toBe(403);
    expect((await list.json()).error).toBe("Your role cannot view the end of day");

    as("books");
    const read = await view(date);
    expect(read.status).toBe(200);
    expect(read.body.data.can.close).toBe(false);
    expect((await close(date)).status).toBe(403);
    const days = await listGet(new NextRequest("http://hurudza.test/api/v2/reports/retail-days?page=1"), { params: Promise.resolve({ key: "retail-days" }) });
    expect(days.status).toBe(200);
  });
});

describe("what stops a day closing", () => {
  it("refuses a day not come yet and an amount that is not money", async () => {
    as("manager");
    expect(await close(daysAgo(-1))).toMatchObject({ status: 400, body: { error: "Pick a day up to today." } });
    expect(await view(daysAgo(-1))).toMatchObject({ status: 400, body: { error: "Pick a day up to today." } });
    expect(await close(daysAgo(19), "26,10.005")).toMatchObject({ status: 400, body: { fieldErrors: { banked: "Write the amount banked, like 2610.00." } } });
    expect(await close(daysAgo(19), "-5")).toMatchObject({ status: 400, body: { fieldErrors: { banked: "Write the amount banked, like 2610.00." } } });
  });

  it("refuses while a drawer is open, naming the till; the checklist says so and links Count and close", async () => {
    const date = daysAgo(18);
    await drawer(date, "front");
    const open = await drawer(date, "back", { open: true });
    as("manager");
    expect(await close(date)).toMatchObject({ status: 409, body: { error: "Back till is still open. Close it first." } });
    const { body } = await view(date);
    const shifts = body.data.checklist.find((item: { key: string }) => item.key === "shifts");
    expect(shifts).toMatchObject({ done: false, detail: "1 of 2. Back till is still open.", action: { label: "Close it", href: `/retail/shifts/${open.id}/close` } });
    expect(body.data.thingsLeft).toBe(1);
    expect(body.data.tills.find((row: { name: string }) => row.name === "Back till")).toMatchObject({ state: "open", difference: null, openShiftId: open.id });
    expect(await prisma.retailDayClose.count({ where: { companyId: shop.companyId } })).toBe(0);
  });

  it("refuses a difference not signed off, and one only being looked into", async () => {
    const date = daysAgo(17);
    await drawer(date, "front");
    const short = await drawer(date, "back", { variance: "-4.50" });
    as("manager");
    expect(await close(date)).toMatchObject({ status: 409, body: { error: "Back till’s US$4.50 is not signed off yet." } });
    const { body } = await view(date);
    expect(body.data.checklist.find((item: { key: string }) => item.key === "signoff")).toMatchObject({
      done: false,
      detail: "Back till is US$4.50 short.",
      action: { label: "Sign off", href: `/retail/shifts/${short.id}?sheet=sign-off&id=${short.id}` },
    });

    await prisma.retailShift.update({ where: { id: short.id }, data: { signOffOutcome: "LOOK_INTO", signedOffAt: new Date() } });
    expect(await close(date)).toMatchObject({ status: 409, body: { error: "Back till’s US$4.50 is not signed off yet." } });
    expect(await prisma.retailZReport.count({ where: { companyId: shop.companyId } })).toBe(0);
  });
});

describe("closing the day", () => {
  it("takes each till's Z-report, freezes the figures, banks the cash to the bank register and the books under one source", async () => {
    const date = daysAgo(16);
    const front = await drawer(date, "front");
    const back = await drawer(date, "back", { variance: "-4.50", signOff: "ACCEPT" });
    await sale(front, "100.00", [{ tender: "CASH", amount: "100.00" }]);
    await sale(front, "50.00", [{ tender: "ECOCASH", amount: "50.00" }]);
    await sale(back, "40.00", [{ tender: "CARD", amount: "40.00" }]);
    await sale(back, "-10.00", [{ tender: "CASH", amount: "-10.00" }], "REFUND");
    as("manager");

    const before = await view(date);
    expect(before.body.data).toMatchObject({
      dateLabel: expect.stringMatching(/^[A-Z][a-z]+ \d{1,2} [A-Z][a-z]+$/),
      takings: "180.00",
      thingsLeft: 0,
      can: { close: true },
      totals: { tills: 2, takings: "180.00", refunds: "10.00", difference: "-4.50" },
      banked: { default: "90.00", account: "CBZ current account", bank: "CBZ" },
    });
    expect(before.body.data.paid).toEqual([
      { tender: "CASH_USD", label: "Cash, US$", currency: "USD", amount: "90.00" },
      { tender: "ECOCASH", label: "EcoCash", currency: "USD", amount: "50.00" },
      { tender: "CARD", label: "Card", currency: "USD", amount: "40.00" },
    ]);

    const answer = await close(date, "90.00");
    expect(answer.status).toBe(200);
    expect(answer.body.data.zReports.map((report: { registerName: string }) => report.registerName).sort()).toEqual(["Back till", "Front till"]);

    const frozen = await prisma.retailDayClose.findUniqueOrThrow({ where: { companyId_siteId_businessDate: { companyId: shop.companyId, siteId: shop.mainId, businessDate: new Date(`${date}T00:00:00.000Z`) } } });
    expect({ takings: frozen.takings.toFixed(2), refunds: frozen.refunds.toFixed(2), difference: frozen.cashDifference.toFixed(2), cashUsd: frozen.cashUsd.toFixed(2), banked: frozen.banked.toFixed(2) }).toEqual({
      takings: "180.00",
      refunds: "10.00",
      difference: "-4.50",
      cashUsd: "90.00",
      banked: "90.00",
    });
    expect(frozen).toMatchObject({ bankAccountId: bankId, closedById: people.manager!.id, closedByName: "Tafara Nyathi" });
    expect(frozen.zReportIds.sort()).toEqual(answer.body.data.zReports.map((report: { id: string }) => report.id).sort());

    // The generator answers with the very reports the close took: nothing new, the same figures.
    for (const till of [tills.front, tills.back]) {
      const again = await generateRetailZReportTransaction({ actor: shop.owner(), registerCode: till.code, businessDate: date });
      expect(again.created).toBe(false);
      expect(frozen.zReportIds).toContain(again.report.id);
    }
    const frontReport = await prisma.retailZReport.findFirstOrThrow({ where: { companyId: shop.companyId, registerCode: tills.front.code } });
    expect(frontReport.grossTakings.toFixed(2)).toBe("150.00");

    const banked = await prisma.bankTransaction.findMany({ where: { companyId: shop.companyId, sourceType: "RETAIL_DAY_BANKED", sourceId: frozen.id } });
    expect(banked).toHaveLength(1);
    expect(banked[0]).toMatchObject({ bankAccountId: bankId, amount: 90, direction: "DEBIT", reference: frozen.id });
    expect(banked[0]!.description).toMatch(/^Takings banked, Harare Main Branch, \d{1,2} [A-Z][a-z]+$/);
    expect(await bankedJournal(frozen.id)).toEqual([
      [
        { code: "1005", debit: 0, credit: 90 },
        { code: "1010", debit: 90, credit: 0 },
      ],
    ]);

    const event = await prisma.platformAuditEvent.findFirst({ where: { companyId: shop.companyId, eventType: RETAIL_AUDIT_EVENTS.dayClosed, entityId: frozen.id } });
    expect(event).not.toBeNull();

    const after = await view(date);
    expect(after.body.data).toMatchObject({ closed: { by: "Tafara Nyathi", banked: "90.00" }, can: { close: false }, thingsLeft: 0 });
    expect(after.body.data.checklist.find((item: { key: string }) => item.key === "banked")).toMatchObject({ done: true, detail: "US$90.00 to CBZ." });

    // Frozen: a void rung later on the day's drawer moves nothing the close wrote.
    await sale(front, "-50.00", [{ tender: "ECOCASH", amount: "-50.00" }], "VOID");
    const later = await view(date);
    expect(later.body.data.takings).toBe("180.00");
    expect(later.body.data.totals.takings).toBe("180.00");
    expect((await prisma.retailDayClose.findUniqueOrThrow({ where: { id: frozen.id } })).takings.toFixed(2)).toBe("180.00");
    expect((await prisma.retailZReport.findUniqueOrThrow({ where: { id: frontReport.id } })).grossTakings.toFixed(2)).toBe("150.00");

    // And it closes once.
    expect(await close(date, "90.00")).toMatchObject({ status: 409, body: { error: expect.stringMatching(/ is closed already\.$/) } });
  });

  it("closes once when two managers press together", async () => {
    const date = daysAgo(15);
    const front = await drawer(date, "front");
    await sale(front, "20.00", [{ tender: "CASH", amount: "20.00" }]);
    as("manager");
    const [one, two] = await Promise.all([close(date, "20.00"), close(date, "20.00")]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    expect([one, two].find((answer) => answer.status === 409)!.body.error).toMatch(/ is closed already\.$/);
    const closes = await prisma.retailDayClose.findMany({ where: { companyId: shop.companyId, businessDate: new Date(`${date}T00:00:00.000Z`) } });
    expect(closes).toHaveLength(1);
    expect(await prisma.bankTransaction.count({ where: { companyId: shop.companyId, sourceType: "RETAIL_DAY_BANKED", sourceId: closes[0]!.id } })).toBe(1);
    expect(await prisma.retailZReport.count({ where: { companyId: shop.companyId, businessDate: new Date(`${date}T00:00:00.000Z`) } })).toBe(1);
  });

  it("closes the fiscal day by hand only once no drawer is open at any site", async () => {
    await prisma.retailFiscalSettings.upsert({ where: { companyId: shop.companyId }, update: { dayClose: "BY_HAND" }, create: { companyId: shop.companyId, dayClose: "BY_HAND" } });
    const device = await prisma.fiscalisationProviderConfig.create({ data: { companyId: shop.companyId, providerKey: FISCAL_PROVIDER_KEY, deviceId: "0441-1234", registeredAt: new Date() } });
    const fiscalDay = await prisma.fiscalDay.create({ data: { companyId: shop.companyId, providerConfigId: device.id, deviceId: "0441-1234", fiscalDayNo: 214 } });

    const date = daysAgo(14);
    const front = await drawer(date, "front");
    const sold = await sale(front, "30.00", [{ tender: "CASH", amount: "30.00" }]);
    await prisma.fiscalReceipt.create({ data: { companyId: shop.companyId, retailSaleId: sold.id, fiscalDayId: fiscalDay.id } });
    const elsewhere = await drawer(daysAgo(0), "borr", { open: true });

    as("manager");
    const before = await view(date);
    expect(before.body.data.checklist.find((item: { key: string }) => item.key === "fiscal")).toMatchObject({
      label: "Fiscal day 214 closed",
      detail: "Closes when you close the day.",
      done: false,
      blocking: false,
    });
    closeFiscalMock.mockClear();
    expect((await close(date, "30.00")).status).toBe(200);
    expect(closeFiscalMock).not.toHaveBeenCalled();
    expect((await prisma.retailDayClose.findFirstOrThrow({ where: { companyId: shop.companyId, businessDate: new Date(`${date}T00:00:00.000Z`) } })).fiscalDayNo).toBe(214);

    // Every drawer in the company closed, the one at Borrowdale last.
    await prisma.retailShift.updateMany({ where: { companyId: shop.companyId, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date(), countedCash: "100.00", variance: "0.00" } });
    expect((await prisma.retailShift.findUniqueOrThrow({ where: { id: elsewhere.id } })).status).toBe("CLOSED");
    const next = daysAgo(13);
    const second = await drawer(next, "front");
    const sold2 = await sale(second, "12.00", [{ tender: "CASH", amount: "12.00" }]);
    await prisma.fiscalReceipt.create({ data: { companyId: shop.companyId, retailSaleId: sold2.id, fiscalDayId: fiscalDay.id } });
    expect((await close(next, "12.00")).status).toBe(200);
    expect(closeFiscalMock).toHaveBeenCalledTimes(1);
    expect(closeFiscalMock.mock.calls[0]!.slice(1)).toEqual([fiscalDay.id, "HAND"]);
  });

  it("needs a bank account to bank cash, and banks nothing without one when nothing is banked", async () => {
    const date = daysAgo(12);
    const front = await drawer(date, "front");
    await sale(front, "8.00", [{ tender: "CASH", amount: "8.00" }]);
    await prisma.accountingSettings.update({ where: { companyId: shop.companyId }, data: { defaultBankAccountId: null } });
    as("manager");
    try {
      expect(await close(date, "8.00")).toMatchObject({ status: 400, body: { error: "Add a bank account in Posting to the books first." } });
      expect((await close(date, "0")).status).toBe(200);
      const frozen = await prisma.retailDayClose.findFirstOrThrow({ where: { companyId: shop.companyId, businessDate: new Date(`${date}T00:00:00.000Z`) } });
      expect(frozen.banked.toFixed(2)).toBe("0.00");
      expect(await prisma.bankTransaction.count({ where: { sourceId: frozen.id } })).toBe(0);
    } finally {
      await prisma.accountingSettings.update({ where: { companyId: shop.companyId }, data: { defaultBankAccountId: bankId } });
    }
  });
});
