import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { activityWords } from "@/lib/retail/activity-words";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * Count and close (50-floor W-39, FLR-04), as the browser calls it: the
 * blind count that learns its difference from the 400, the two journals and
 * that they balance (the ZiG part leaving 1001), the sign-off only a balanced
 * drawer writes, who hears of a difference, a sale racing the close, the
 * fiscal day closing with the last shift, close without counting, and every
 * refusal the packet names. Against the test database, with only the sign-in
 * faked.
 */

const { validateSessionMock, fiscalCalls } = vi.hoisted(() => ({ validateSessionMock: vi.fn(), fiscalCalls: [] as unknown[] }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

// The fiscal day itself is fiscal-settings.test.ts's (with the fake FDMS); here, only that the close asks after its commit.
vi.mock("@/lib/retail/fiscal-settings", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/retail/fiscal-settings")>();
  return {
    ...real,
    closeFiscalDayIfLastShift: async (...args: Parameters<typeof real.closeFiscalDayIfLastShift>) => {
      fiscalCalls.push({ actor: args[0], open: await prisma.retailShift.count({ where: { companyId: args[0].companyId, status: "OPEN" } }) });
      return real.closeFiscalDayIfLastShift(...args);
    },
  };
});

import { GET as formGet, POST as closePost } from "@/app/api/v2/retail/shifts/[id]/close/route";
import { POST as uncountedPost } from "@/app/api/v2/retail/shifts/[id]/close-uncounted/route";

import { closeShift } from "./shifts";

let shop: TestShop;
let front: string;
let back: string;
const people: Record<string, { id: string; name: string; role: string }> = {};
let seq = 0;

const sessionOf = (who: string) => {
  const person = people[who]!;
  return { user: { id: person.id, companyId: shop.companyId, role: person.role, name: person.name, email: `${who}@close.test`, enabledFeatures: ["retail.core", "retail.shifts"] } };
};

function as(who: string) {
  validateSessionMock.mockResolvedValue({ session: sessionOf(who) });
}

async function call(
  handler: (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>,
  id: string,
  body?: unknown,
) {
  const request = new NextRequest(
    `http://hurudza.test/api/v2/retail/shifts/${id}/close`,
    body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const response = await handler(request, { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

/** A drawer open on a till for a cashier, with what should be in it. */
async function openDrawer(cashier: string, expected: string, till = front) {
  seq += 1;
  const shift = await prisma.retailShift.create({
    data: {
      companyId: shop.companyId,
      shiftNo: `SH-${String(90000 + seq)}-${shop.companyId.slice(0, 4)}`,
      registerId: till,
      registerCode: till === front ? "FRONT" : "BACK",
      registerName: till === front ? "Front till" : "Back till",
      siteId: shop.mainId,
      cashierId: people[cashier]!.id,
      cashierName: people[cashier]!.name,
      openingFloat: "100.00",
      expectedCash: expected,
      openedAt: new Date(Date.now() - 6 * 3600_000),
    },
  });
  return shift;
}

const rows = (counts: Record<string, number>) => Object.entries(counts).map(([denomination, count]) => ({ denomination, count }));
// ShiftClose.png: US$167.00 and ZiG 925.00.
const BOARD = {
  USD: rows({ "100": 0, "50": 1, "20": 2, "10": 4, "5": 3, "2": 5, "1": 12 }),
  ZWG: rows({ "200": 2, "100": 3, "50": 4, "20": 1, "10": 0, "5": 1 }),
};
// US$158.00: four-fifty short of US$162.50.
const SHORT = { USD: rows({ "50": 1, "20": 2, "10": 4, "5": 3, "2": 5, "1": 3 }) };

async function journal(sourceType: "RETAIL_SHIFT_CLOSE" | "RETAIL_SHIFT_VARIANCE", sourceId: string) {
  await runRetailPosting(shop.companyId, "BY_HAND", null);
  const [entry] = await prisma.journalEntry.findMany({
    where: { companyId: shop.companyId, sourceType, sourceId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  if (!entry) return null;
  return entry.lines.map((line) => ({ code: line.account.code, debit: line.debit, credit: line.credit })).sort((a, b) => a.code.localeCompare(b.code));
}

const balanced = (lines: Array<{ debit: number; credit: number }> | null) =>
  Math.round((lines ?? []).reduce((sum, line) => sum + line.debit - line.credit, 0) * 100);

const told = (shiftId: string) =>
  prisma.notification.findMany({
    where: { companyId: shop.companyId, entityId: shiftId, type: "RETAIL_SHIFT_DIFFERENCE" },
    select: { title: true, summary: true, recipients: { select: { userId: true } } },
  });

beforeAll(async () => {
  shop = await makeTestShop("Shift close");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  const till = async (code: string, name: string) =>
    (await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId: shop.mainId, code: `${code}-${shop.companyId.slice(0, 6)}`, name }, select: { id: true } })).id;
  front = await till("FRONT", "Front till");
  back = await till("BACK", "Back till");
  people.owner = { id: shop.ownerId, name: "Tendai Mhlanga", role: "SUPERADMIN" };
  people.manager = { id: shop.managerId, name: "Tafara Nyathi", role: "MANAGER" };
  for (const [key, name, role] of [
    ["chipo", "Chipo Dube", "CASHIER"],
    ["kuda", "Kuda Banda", "CASHIER"],
    ["clerk", "Tendai Sibanda", "STOCK_CLERK"],
    ["books", "Ruvimbo Chari", "FINANCE_OFFICER"],
  ] as const) {
    const user = await prisma.user.create({ data: { companyId: shop.companyId, name, role, email: `${key}-${shop.companyId}@close.test` }, select: { id: true } });
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
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.approvalAction.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("a cashier counting her own drawer, blind", () => {
  it("reads no expected figure, learns −US$4.50 from the 400, then closes with a note", async () => {
    const shift = await openDrawer("chipo", "162.50");
    as("chipo");
    const form = await call(formGet, shift.id);
    expect(form.status).toBe(200);
    expect(form.body.data).toMatchObject({ blind: true, expected: null, parts: null, rate: "26.80", floatLeft: "100.00", closed: null });
    expect(form.body.data.sub).toBe("Front till · Chipo Dube · open 6h 00m");
    expect(form.body.data.denominations).toEqual({ USD: ["100", "50", "20", "10", "5", "2", "1"], ZWG: ["200", "100", "50", "20", "10", "5"] });

    const refused = await call(closePost, shift.id, { counts: SHORT, floatLeft: "100.00" });
    expect(refused).toEqual({
      status: 400,
      body: { error: "It is out by −US$4.50. Say what happened, then close.", difference: "-4.50", fieldErrors: { note: "Say what happened." } },
    });
    expect((await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe("OPEN");

    const closed = await call(closePost, shift.id, { counts: SHORT, floatLeft: "100.00", note: "Gave change for US$20 instead of US$10" });
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ shiftNo: shift.shiftNo, difference: "-4.50", state: "SHORT" });

    const row = await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(row).toMatchObject({ status: "CLOSED", closedById: people.chipo!.id, closeNote: "Gave change for US$20 instead of US$10" });
    expect([row.countedCash?.toFixed(2), row.countedUsd?.toFixed(2), row.countedZig?.toFixed(2), row.variance?.toFixed(2), row.floatLeft?.toFixed(2), row.toSafe?.toFixed(2)]).toEqual([
      "158.00", "158.00", "0.00", "-4.50", "100.00", "58.00",
    ]);
    expect(row.countLines).toEqual({ USD: SHORT.USD, ZWG: [] });

    // Short: Dr 5420 / Cr 1000 US$4.50, and US$58.00 from the drawer to the safe.
    const variance = await journal("RETAIL_SHIFT_VARIANCE", shift.id);
    expect(variance).toEqual([
      { code: "1000", debit: 0, credit: 4.5 },
      { code: "5420", debit: 4.5, credit: 0 },
    ]);
    const toSafe = await journal("RETAIL_SHIFT_CLOSE", shift.id);
    expect(toSafe).toEqual([
      { code: "1000", debit: 0, credit: 58 },
      { code: "1005", debit: 58, credit: 0 },
    ]);
    expect(balanced(variance)).toBe(0);
    expect(balanced(toSafe)).toBe(0);

    // A different drawer waits for a manager's sign-off: no approval yet. The owner and Tafara hear of it, Chipo does not.
    expect(await prisma.approvalAction.count({ where: { companyId: shop.companyId, entityId: shift.id } })).toBe(0);
    const notes = await told(shift.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: `${shift.shiftNo} is short US$4.50`, summary: "Front till · Chipo Dube. Sign it off on the overview." });
    expect(notes[0]!.recipients.map((r) => r.userId).sort()).toEqual([people.owner!.id, people.manager!.id].sort());

    const audit = await prisma.platformAuditEvent.findFirst({ where: { companyId: shop.companyId, entityId: shift.id, eventType: "RETAIL_SHIFT.CLOSED" } });
    expect(JSON.parse(audit!.payloadJson!)).toMatchObject({ countedUsd: "158.00", countedZig: "0.00", floatLeft: "100.00", toSafe: "58.00", closedByOwner: true });

    // The closed shift's page reads its count back, read-only.
    const after = await call(formGet, shift.id);
    expect(after.body.data.closed).toMatchObject({ difference: "-4.50", state: "Short", note: "Gave change for US$20 instead of US$10" });
    expect(after.body.data.closed.lines.USD).toEqual(SHORT.USD);
  });
});

describe("a manager closing Chipo's drawer with ZiG in it", () => {
  it("reads the parts, counts the board's notes to US$201.51, balances, and splits the safe journal by currency", async () => {
    const shift = await openDrawer("chipo", "201.50");
    as("manager");
    const form = await call(formGet, shift.id);
    expect(form.body.data).toMatchObject({ blind: false, expected: "201.50", parts: { openingFloat: "100.00", cashSales: "0.00", moves: null } });

    const closed = await call(closePost, shift.id, { counts: BOARD, floatLeft: "100.00" });
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ difference: "0.00", state: "BALANCED" });
    const row = await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id } });
    expect([row.countedCash?.toFixed(2), row.countedUsd?.toFixed(2), row.countedZig?.toFixed(2), row.countRate?.toFixed(2), row.variance?.toFixed(2), row.toSafe?.toFixed(2)]).toEqual([
      "201.51", "167.00", "925.00", "26.80", "0.00", "101.51",
    ]);
    expect(row.closedById).toBe(people.manager!.id);

    // Every ZiG note leaves 1001; the float left is dollars: 101.51 = 67.00 + 34.51.
    const toSafe = await journal("RETAIL_SHIFT_CLOSE", shift.id);
    expect(toSafe).toEqual([
      { code: "1000", debit: 0, credit: 67 },
      { code: "1001", debit: 0, credit: 34.51 },
      { code: "1005", debit: 101.51, credit: 0 },
    ]);
    expect(balanced(toSafe)).toBe(0);
    expect(await journal("RETAIL_SHIFT_VARIANCE", shift.id)).toBeNull();

    // Balanced: signed off as it closes, and nobody is told.
    expect(await prisma.approvalAction.count({ where: { companyId: shop.companyId, entityId: shift.id, action: "APPROVE", toStatus: "CLOSED" } })).toBe(1);
    expect(await told(shift.id)).toHaveLength(0);
  });

  it("is asked what happened only when the difference shows, and tells everyone but the closer", async () => {
    const shift = await openDrawer("chipo", "155.00");
    as("manager");
    // US$158.00 against 155.00: over US$3.00 with a note.
    const closed = await call(closePost, shift.id, { counts: SHORT, floatLeft: "100.00", note: "A customer left change" });
    expect(closed.body.data).toMatchObject({ difference: "3.00", state: "OVER" });
    const notes = await told(shift.id);
    expect(notes[0]!.title).toBe(`${shift.shiftNo} is over US$3.00`);
    expect(notes[0]!.recipients.map((r) => r.userId)).toEqual([people.owner!.id]);
    expect(await journal("RETAIL_SHIFT_VARIANCE", shift.id)).toEqual([
      { code: "1000", debit: 3, credit: 0 },
      { code: "5420", debit: 0, credit: 3 },
    ]);
  });
});

describe("refusals", () => {
  it("answers the bookkeeper and the stock clerk with the matrix's sentence, page and close alike", async () => {
    const shift = await openDrawer("kuda", "100.00", back);
    for (const who of ["books", "clerk"]) {
      as(who);
      expect(await call(formGet, shift.id)).toEqual({ status: 403, body: { error: "Your role cannot close a till shift in sales" } });
      expect(await call(closePost, shift.id, { counts: { USD: rows({ "100": 1 }) }, floatLeft: "0" })).toEqual({
        status: 403,
        body: { error: "Your role cannot close a till shift in sales" },
      });
    }
    // Another cashier's drawer.
    as("chipo");
    expect(await call(closePost, shift.id, { counts: { USD: rows({ "100": 1 }) }, floatLeft: "0" })).toEqual({
      status: 403,
      body: { error: `Only ${shift.shiftNo}’s cashier or a manager can close it.` },
    });
    expect((await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe("OPEN");
  });

  it("refuses half a note, a float above the US$ counted, ZiG where the shop takes none, and a closed shift", async () => {
    const shift = await openDrawer("kuda", "100.00", back);
    as("manager");
    expect(await call(closePost, shift.id, { counts: { USD: [{ denomination: "20", count: 1.5 }] }, floatLeft: "0" })).toEqual({
      status: 400,
      body: { error: "Count whole notes.", fieldErrors: { "usd.20": "Count whole notes." } },
    });
    expect(await call(closePost, shift.id, { counts: BOARD, floatLeft: "170.00" })).toEqual({
      status: 400,
      body: { error: "Only US$167.00 in US$ notes was counted.", fieldErrors: { floatLeft: "Only US$167.00 in US$ notes was counted." } },
    });
    await prisma.retailPaymentSettings.update({ where: { companyId: shop.companyId }, data: { takeCashZig: false } });
    try {
      expect(await call(closePost, shift.id, { counts: BOARD, floatLeft: "0" })).toEqual({
        status: 400,
        body: { error: "This shop does not take ZiG cash.", fieldErrors: { zwg: "This shop does not take ZiG cash." } },
      });
    } finally {
      await prisma.retailPaymentSettings.update({ where: { companyId: shop.companyId }, data: { takeCashZig: true } });
    }
    expect((await call(closePost, shift.id, { counts: { USD: rows({ "100": 1 }) }, floatLeft: "0" })).status).toBe(200);
    expect(await call(closePost, shift.id, { counts: { USD: rows({ "100": 1 }) }, floatLeft: "0" })).toEqual({
      status: 409,
      body: { error: `${shift.shiftNo} is closed already.` },
    });
  });
});

describe("a sale racing the close", () => {
  it("is either in what should be there or refused, never lost between them", async () => {
    for (let round = 0; round < 4; round += 1) {
      const shift = await openDrawer("kuda", "100.00", back);
      // The sale's own guarded increment (`_services.ts`): the shift must still be open when its row lock is free.
      const sale = prisma.$transaction(async (tx) => {
        const updated = await tx.retailShift.updateMany({ where: { id: shift.id, status: "OPEN" }, data: { expectedCash: { increment: 10 } } });
        if (updated.count !== 1) throw new Error("Shift is no longer open.");
      });
      const [sold, closed] = await Promise.allSettled([
        sale,
        closeShift({ session: sessionOf("manager"), shiftId: shift.id, body: { counts: { USD: rows({ "100": 1 }) }, floatLeft: "0", note: "Race" } }),
      ]);
      expect(closed.status).toBe("fulfilled");
      const row = await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id } });
      if (sold.status === "fulfilled") {
        expect(row.expectedCash.toFixed(2)).toBe("110.00");
        expect(row.variance?.toFixed(2)).toBe("-10.00");
      } else {
        expect(String(sold.reason)).toMatch(/no longer open/);
        expect(row.expectedCash.toFixed(2)).toBe("100.00");
        expect(row.variance?.toFixed(2)).toBe("0.00");
      }
    }
  }, 60_000);
});

describe("the fiscal day", () => {
  it("is asked to close after the commit, with no shift left open when it was the last", async () => {
    await prisma.retailShift.updateMany({ where: { companyId: shop.companyId, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date() } });
    const shift = await openDrawer("chipo", "100.00");
    fiscalCalls.length = 0;
    await closeShift({ session: sessionOf("chipo"), shiftId: shift.id, body: { counts: { USD: rows({ "100": 1 }) }, floatLeft: "0" } });
    expect(fiscalCalls).toEqual([{ actor: expect.objectContaining({ companyId: shop.companyId, userId: people.chipo!.id }), open: 0 }]);
  });
});

describe("close without counting", () => {
  it("is cash control's, needs why, closes Not counted with no journal, and tells the managers", async () => {
    const shift = await openDrawer("kuda", "72.95", back);
    as("chipo");
    expect(await call(uncountedPost, shift.id, { reason: "Lost it" })).toEqual({
      status: 403,
      body: { error: "Your role cannot close a till shift in shifts and cash" },
    });
    as("manager");
    expect(await call(uncountedPost, shift.id, { reason: "no" })).toEqual({
      status: 400,
      body: { error: "Say why it was not counted.", fieldErrors: { why: "Say why it was not counted." } },
    });
    const done = await call(uncountedPost, shift.id, { reason: "The handheld was lost" });
    expect(done.status).toBe(200);
    expect(done.body.data.shiftNo).toBe(shift.shiftNo);

    const row = await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(row).toMatchObject({ status: "CLOSED", countedCash: null, variance: null, closeNote: "The handheld was lost", closedById: people.manager!.id });
    expect(row.expectedCash.toFixed(2)).toBe("72.95");
    await runRetailPosting(shop.companyId, "BY_HAND", null);
    expect(await prisma.journalEntry.count({ where: { companyId: shop.companyId, sourceId: shift.id } })).toBe(0);
    expect(await prisma.approvalAction.count({ where: { companyId: shop.companyId, entityId: shift.id } })).toBe(0);

    const notes = await told(shift.id);
    expect(notes[0]!.title).toBe(`${shift.shiftNo} closed without a count`);
    expect(notes[0]!.recipients.map((r) => r.userId)).toEqual([people.owner!.id]);

    const audit = await prisma.platformAuditEvent.findFirst({ where: { companyId: shop.companyId, entityId: shift.id, eventType: "RETAIL_SHIFT.CLOSED" } });
    expect(activityWords("RETAIL_SHIFT.CLOSED", JSON.parse(audit!.payloadJson!))).toEqual({ what: "Closed without a count: The handheld was lost", tone: "warn" });

    expect(await call(uncountedPost, shift.id, { reason: "Again" })).toEqual({ status: 409, body: { error: `${shift.shiftNo} is closed already.` } });
  });
});
